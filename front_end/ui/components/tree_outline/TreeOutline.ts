// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable rulesdir/no-lit-render-outside-of-view */

import * as Platform from '../../../core/platform/platform.js';
import * as UI from '../../legacy/legacy.js';
import * as Lit from '../../lit/lit.js';
import * as VisualLogging from '../../visual_logging/visual_logging.js';
import * as Buttons from '../buttons/buttons.js';
import * as CodeHighlighter from '../code_highlighter/code_highlighter.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import * as RenderCoordinator from '../render_coordinator/render_coordinator.js';

import treeOutlineStyles from './treeOutline.css.js';
import {
  findNextNodeForTreeOutlineKeyboardNavigation,
  getNodeChildren,
  getPathToTreeNode,
  isExpandableNode,
  trackDOMNodeToTreeNode,
  type TreeNode,
  type TreeNodeId,
  type TreeNodeWithChildren,
} from './TreeOutlineUtils.js';

const {html, Directives: {ifDefined}} = Lit;

export interface TreeOutlineData<TreeNodeDataType> {
  defaultRenderer: (node: TreeNode<TreeNodeDataType>, state: {isExpanded: boolean}) => Lit.TemplateResult;
  /**
   * Note: it is important that all the TreeNode objects are unique. They are
   * used internally to the TreeOutline as keys to track state (such as if a
   * node is expanded or not), and providing the same object multiple times will
   * cause issues in the TreeOutline.
   */
  tree: ReadonlyArray<TreeNode<TreeNodeDataType>>;
  filter?: (node: TreeNodeDataType) => FilterOption;
  compact?: boolean;
}

export function defaultRenderer(node: TreeNode<string>): Lit.TemplateResult {
  return html`${node.treeNodeData}`;
}

export class ItemSelectedEvent<TreeNodeDataType> extends Event {
  static readonly eventName = 'itemselected';
  data: {
    node: TreeNode<TreeNodeDataType>,
  };

  constructor(node: TreeNode<TreeNodeDataType>) {
    super(ItemSelectedEvent.eventName, {bubbles: true, composed: true});
    this.data = {node};
  }
}

export class ItemMouseOverEvent<TreeNodeDataType> extends Event {
  static readonly eventName = 'itemmouseover';
  data: {
    node: TreeNode<TreeNodeDataType>,
  };

  constructor(node: TreeNode<TreeNodeDataType>) {
    super(ItemMouseOverEvent.eventName, {bubbles: true, composed: true});
    this.data = {node};
  }
}

export class ItemMouseOutEvent<TreeNodeDataType> extends Event {
  static readonly eventName = 'itemmouseout';
  data: {
    node: TreeNode<TreeNodeDataType>,
  };

  constructor(node: TreeNode<TreeNodeDataType>) {
    super(ItemMouseOutEvent.eventName, {bubbles: true, composed: true});
    this.data = {node};
  }
}

/**
 *
 * The tree can be filtered by providing a custom filter function.
 * The filter is applied on every node when constructing the tree
 * and proceeds as follows:
 * - If the filter return SHOW for a node, the node is included in the tree.
 * - If the filter returns FLATTEN, the node is ignored but its subtree is included.
 */
export const enum FilterOption {
  SHOW = 'SHOW',
  FLATTEN = 'FLATTEN',
}

export class TreeOutline<TreeNodeDataType> extends HTMLElement {
  readonly #shadow = this.attachShadow({mode: 'open'});
  #treeData: ReadonlyArray<TreeNode<TreeNodeDataType>> = [];
  #nodeExpandedMap = new Map<string, boolean>();
  #domNodeToTreeNodeMap = new WeakMap<HTMLLIElement, TreeNode<TreeNodeDataType>>();
  #hasRenderedAtLeastOnce = false;
  /**
   * If we have expanded to a certain node, we want to focus it once we've
   * rendered. But we render lazily and wrapped in Lit.until, so we can't
   * know for sure when that node will be rendered. This variable tracks the
   * node that we want focused but may not yet have been rendered.
   */
  #nodeIdPendingFocus: TreeNodeId|null = null;
  #selectedTreeNode: TreeNode<TreeNodeDataType>|null = null;
  #defaultRenderer = (node: TreeNode<TreeNodeDataType>, _state: {isExpanded: boolean}): Lit.TemplateResult => {
    if (typeof node.treeNodeData !== 'string') {
      console.warn(`The default TreeOutline renderer simply stringifies its given value. You passed in ${
          JSON.stringify(
              node.treeNodeData, null,
              2)}. Consider providing a different defaultRenderer that can handle nodes of this type.`);
    }
    return html`${String(node.treeNodeData)}`;
  };
  #nodeFilter?: ((node: TreeNodeDataType) => FilterOption);
  #compact = false;

  /**
   * scheduledRender = render() has been called and scheduled a render.
   */
  #scheduledRender = false;
  /**
   * enqueuedRender = render() was called mid-way through an existing render.
   */
  #enqueuedRender = false;

  static get observedAttributes(): string[] {
    return ['nowrap', 'toplevelbordercolor'];
  }

  attributeChangedCallback(name: 'nowrap'|'toplevelbordercolor', oldValue: string|null, newValue: string|null): void {
    if (oldValue === newValue) {
      return;
    }

    switch (name) {
      case 'nowrap': {
        this.#setNodeKeyNoWrapCSSVariable(newValue);
        break;
      }
      case 'toplevelbordercolor': {
        this.#setTopLevelNodeBorderColorCSSVariable(newValue);
        break;
      }
    }
  }

  connectedCallback(): void {
    this.#setTopLevelNodeBorderColorCSSVariable(this.getAttribute('toplevelbordercolor'));
    this.#setNodeKeyNoWrapCSSVariable(this.getAttribute('nowrap'));
  }

  get data(): TreeOutlineData<TreeNodeDataType> {
    return {
      tree: this.#treeData as Array<TreeNode<TreeNodeDataType>>,
      defaultRenderer: this.#defaultRenderer,
    };
  }

  set data(data: TreeOutlineData<TreeNodeDataType>) {
    this.#defaultRenderer = data.defaultRenderer;
    this.#treeData = data.tree;
    this.#nodeFilter = data.filter;
    this.#compact = data.compact || false;

    if (!this.#hasRenderedAtLeastOnce) {
      this.#selectedTreeNode = this.#treeData[0];
    }
    void this.#render();
  }

  /**
   * Recursively expands the tree from the root nodes, to a max depth. The max
   * depth is 0 indexed - so a maxDepth of 2 (default) will expand 3 levels: 0,
   * 1 and 2.
   */
  async expandRecursively(maxDepth = 2): Promise<void> {
    await Promise.all(this.#treeData.map(rootNode => this.#expandAndRecurse(rootNode, 0, maxDepth)));
    await this.#render();
  }

  /**
   * Collapses all nodes in the tree.
   */
  async collapseAllNodes(): Promise<void> {
    this.#nodeExpandedMap.clear();
    await this.#render();
  }

  /**
   * Takes a TreeNode, expands the outline to reveal it, and focuses it.
   */
  async expandToAndSelectTreeNode(targetTreeNode: TreeNode<TreeNodeDataType>): Promise<void> {
    return await this.expandToAndSelectTreeNodeId(targetTreeNode.id);
  }

  /**
   * Takes a TreeNode ID, expands the outline to reveal it, and focuses it.
   */
  async expandToAndSelectTreeNodeId(targetTreeNodeId: TreeNodeId): Promise<void> {
    const pathToTreeNode = await getPathToTreeNode(this.#treeData, targetTreeNodeId);

    if (pathToTreeNode === null) {
      throw new Error(`Could not find node with id ${targetTreeNodeId} in the tree.`);
    }
    pathToTreeNode.forEach((node, index) => {
      // We don't expand the very last node, which was the target node.
      if (index < pathToTreeNode.length - 1) {
        this.#setNodeExpandedState(node, true);
      }
    });

    // Mark the node as pending focus so when it is rendered into the DOM we can focus it
    this.#nodeIdPendingFocus = targetTreeNodeId;
    await this.#render();
  }

  /**
   * Takes a list of TreeNode IDs and expands the corresponding nodes.
   */
  expandNodeIds(nodeIds: TreeNodeId[]): Promise<void> {
    nodeIds.forEach(id => this.#nodeExpandedMap.set(id, true));
    return this.#render();
  }

  /**
   * Takes a TreeNode ID and focuses the corresponding node.
   */
  focusNodeId(nodeId: TreeNodeId): Promise<void> {
    this.#nodeIdPendingFocus = nodeId;
    return this.#render();
  }

  async collapseChildrenOfNode(domNode: HTMLLIElement): Promise<void> {
    const treeNode = this.#domNodeToTreeNodeMap.get(domNode);
    if (!treeNode) {
      return;
    }
    await this.#recursivelyCollapseTreeNodeChildren(treeNode);
    await this.#render();
  }

  #setNodeKeyNoWrapCSSVariable(attributeValue: string|null): void {
    this.style.setProperty('--override-key-whitespace-wrapping', attributeValue !== null ? 'nowrap' : 'initial');
  }

  #setTopLevelNodeBorderColorCSSVariable(attributeValue: string|null): void {
    this.style.setProperty('--override-top-node-border', attributeValue ? `1px solid ${attributeValue}` : '');
  }

  async #recursivelyCollapseTreeNodeChildren(treeNode: TreeNode<TreeNodeDataType>): Promise<void> {
    if (!isExpandableNode(treeNode) || !this.#nodeIsExpanded(treeNode)) {
      return;
    }
    const children = await this.#fetchNodeChildren(treeNode);
    const childRecursions = Promise.all(children.map(child => this.#recursivelyCollapseTreeNodeChildren(child)));
    await childRecursions;
    this.#setNodeExpandedState(treeNode, false);
  }

  async #flattenSubtree(node: TreeNodeWithChildren<TreeNodeDataType>, filter: (node: TreeNodeDataType) => FilterOption):
      Promise<Array<TreeNode<TreeNodeDataType>>> {
    const children = await getNodeChildren(node);
    const filteredChildren = [];
    for (const child of children) {
      const filtering = filter(child.treeNodeData);
      // We always include the selected node in the tree, regardless of its filtering status.
      const toBeSelected = this.#isSelectedNode(child) || child.id === this.#nodeIdPendingFocus;
      // If a node is already expanded we should not flatten it away.
      const expanded = this.#nodeExpandedMap.get(child.id);
      if (filtering === FilterOption.SHOW || toBeSelected || expanded) {
        filteredChildren.push(child);
      } else if (filtering === FilterOption.FLATTEN && isExpandableNode(child)) {
        const grandChildren = await this.#flattenSubtree(child, filter);
        filteredChildren.push(...grandChildren);
      }
    }
    return filteredChildren;
  }

  async #fetchNodeChildren(node: TreeNodeWithChildren<TreeNodeDataType>): Promise<Array<TreeNode<TreeNodeDataType>>> {
    const children = await getNodeChildren(node);
    const filter = this.#nodeFilter;
    if (!filter) {
      return children;
    }
    const filteredDescendants = await this.#flattenSubtree(node, filter);
    return filteredDescendants.length ? filteredDescendants : children;
  }

  #setNodeExpandedState(node: TreeNode<TreeNodeDataType>, newExpandedState: boolean): void {
    this.#nodeExpandedMap.set(node.id, newExpandedState);
  }

  #nodeIsExpanded(node: TreeNode<TreeNodeDataType>): boolean {
    return this.#nodeExpandedMap.get(node.id) || false;
  }

  async #expandAndRecurse(node: TreeNode<TreeNodeDataType>, currentDepth: number, maxDepth: number): Promise<void> {
    if (!isExpandableNode(node)) {
      return;
    }
    this.#setNodeExpandedState(node, true);
    if (currentDepth === maxDepth || !isExpandableNode(node)) {
      return;
    }
    const children = await this.#fetchNodeChildren(node);
    await Promise.all(children.map(child => this.#expandAndRecurse(child, currentDepth + 1, maxDepth)));
  }

  #onArrowClick(node: TreeNode<TreeNodeDataType>): ((e: Event) => void) {
    return (event: Event): void => {
      event.stopPropagation();
      if (isExpandableNode(node)) {
        this.#setNodeExpandedState(node, !this.#nodeIsExpanded(node));
        void this.#render();
      }
    };
  }

  #onNodeClick(event: Event): void {
    // Avoid it bubbling up to parent tree elements, else clicking a node deep in the tree will toggle it + all its ancestor's visibility.
    event.stopPropagation();
    const nodeClickExpandsOrContracts = this.getAttribute('clickabletitle') !== null;
    const domNode = event.currentTarget as HTMLLIElement;
    const node = this.#domNodeToTreeNodeMap.get(domNode);
    if (nodeClickExpandsOrContracts && node && isExpandableNode(node)) {
      this.#setNodeExpandedState(node, !this.#nodeIsExpanded(node));
    }
    void this.#focusTreeNode(domNode);
  }

  async #focusTreeNode(domNode: HTMLLIElement): Promise<void> {
    const treeNode = this.#domNodeToTreeNodeMap.get(domNode);
    if (!treeNode) {
      return;
    }
    this.#selectedTreeNode = treeNode;
    await this.#render();
    this.dispatchEvent(new ItemSelectedEvent(treeNode));
    void RenderCoordinator.write('DOMNode focus', () => {
      domNode.focus();
    });
  }

  #processHomeAndEndKeysNavigation(key: 'Home'|'End'): void {
    if (key === 'Home') {
      const firstRootNode = this.#shadow.querySelector<HTMLLIElement>('ul[role="tree"] > li[role="treeitem"]');
      if (firstRootNode) {
        void this.#focusTreeNode(firstRootNode);
      }
    } else if (key === 'End') {
      /**
       * The End key takes the user to the last visible node in the tree - you
       * can think of this as the one that's rendered closest to the bottom of
       * the page.
       *
       * We could walk our tree and compute this - but it will also be the last
       * li[role="treeitem"] in the DOM because we only render visible nodes.
       * Therefore we can select all the nodes and pick the last one.
       */
      const allTreeItems = this.#shadow.querySelectorAll<HTMLLIElement>('li[role="treeitem"]');
      const lastTreeItem = allTreeItems[allTreeItems.length - 1];
      if (lastTreeItem) {
        void this.#focusTreeNode(lastTreeItem);
      }
    }
  }

  async #processArrowKeyNavigation(key: Platform.KeyboardUtilities.ArrowKey, currentDOMNode: HTMLLIElement):
      Promise<void> {
    const currentTreeNode = this.#domNodeToTreeNodeMap.get(currentDOMNode);
    if (!currentTreeNode) {
      return;
    }

    const domNode = findNextNodeForTreeOutlineKeyboardNavigation({
      currentDOMNode,
      currentTreeNode,
      direction: key,
      setNodeExpandedState: (node, expanded) => this.#setNodeExpandedState(node, expanded),
    });
    await this.#focusTreeNode(domNode);
  }

  #processEnterOrSpaceNavigation(currentDOMNode: HTMLLIElement): void {
    const currentTreeNode = this.#domNodeToTreeNodeMap.get(currentDOMNode);
    if (!currentTreeNode) {
      return;
    }
    if (isExpandableNode(currentTreeNode)) {
      const currentExpandedState = this.#nodeIsExpanded(currentTreeNode);
      this.#setNodeExpandedState(currentTreeNode, !currentExpandedState);
      void this.#render();
    }
  }

  async #onTreeKeyDown(event: KeyboardEvent): Promise<void> {
    if (!(event.target instanceof HTMLLIElement)) {
      throw new Error('event.target was not an <li> element');
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.#processHomeAndEndKeysNavigation(event.key);
    } else if (Platform.KeyboardUtilities.keyIsArrowKey(event.key)) {
      event.preventDefault();
      await this.#processArrowKeyNavigation(event.key, event.target);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.#processEnterOrSpaceNavigation(event.target);
    }
  }

  #focusPendingNode(domNode: HTMLLIElement): void {
    this.#nodeIdPendingFocus = null;
    void this.#focusTreeNode(domNode);
  }

  #isSelectedNode(node: TreeNode<TreeNodeDataType>): boolean {
    if (this.#selectedTreeNode) {
      return node.id === this.#selectedTreeNode.id;
    }
    return false;
  }

  #renderNode(node: TreeNode<TreeNodeDataType>, {depth, setSize, positionInSet}: {
    depth: number,
    setSize: number,
    positionInSet: number,
  }): Lit.TemplateResult {
    let childrenToRender;
    const nodeIsExpanded = this.#nodeIsExpanded(node);
    if (!isExpandableNode(node) || !nodeIsExpanded) {
      childrenToRender = Lit.nothing;
    } else {
      const childNodes = this.#fetchNodeChildren(node).then(children => {
        return children.map((childNode, index) => {
          return this.#renderNode(childNode, {depth: depth + 1, setSize: children.length, positionInSet: index});
        });
      });
      // Disabled until https://crbug.com/1079231 is fixed.
      // clang-format off
      childrenToRender = html`<ul role="group">${Lit.Directives.until(childNodes)}</ul>`;
      // clang-format on
    }

    const nodeIsFocusable = this.#isSelectedNode(node);
    const tabIndex = nodeIsFocusable ? 0 : -1;
    const listItemClasses = Lit.Directives.classMap({
      expanded: isExpandableNode(node) && nodeIsExpanded,
      parent: isExpandableNode(node),
      selected: this.#isSelectedNode(node),
      'is-top-level': depth === 0,
      compact: this.#compact,
    });
    const ariaExpandedAttribute = !isExpandableNode(node) ? undefined : nodeIsExpanded ? 'true' : 'false';

    let renderedNodeKey: Lit.TemplateResult;
    if (node.renderer) {
      renderedNodeKey = node.renderer(node, {isExpanded: nodeIsExpanded});
    } else {
      renderedNodeKey = this.#defaultRenderer(node, {isExpanded: nodeIsExpanded});
    }

    // Disabled until https://crbug.com/1079231 is fixed.
    // clang-format off
    return html`
      <li role="treeitem"
        tabindex=${tabIndex}
        aria-setsize=${setSize}
        aria-expanded=${ifDefined(ariaExpandedAttribute)}
        aria-level=${depth + 1}
        aria-posinset=${positionInSet + 1}
        class=${listItemClasses}
        jslog=${VisualLogging.treeItem(node.jslogContext).track({click: true, keydown: 'ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Enter|Space|Home|End'})}
        @click=${this.#onNodeClick}
        track-dom-node-to-tree-node=${trackDOMNodeToTreeNode(this.#domNodeToTreeNodeMap, node)}
        on-render=${ComponentHelpers.Directives.nodeRenderedCallback(domNode => {
         /**
          * Because TreeNodes are lazily rendered, you can call
          * `outline.expandToAndSelect(NodeX)`, but `NodeX` will be rendered at some
          * later point, once it's been fully resolved, within a Lit.until
          * directive. That means we don't have a direct hook into when it's
          * rendered, which we need because we want to focus the element, so we use this directive to receive a callback when the node is rendered.
          */
          if (!(domNode instanceof HTMLLIElement)) {
            return;
          }

          if (this.#nodeIdPendingFocus && node.id === this.#nodeIdPendingFocus) {
            this.#focusPendingNode(domNode);
          }
        })}
      >
        <span class="arrow-and-key-wrapper"
          @mouseover=${() => {
            this.dispatchEvent(new ItemMouseOverEvent(node));
          }}
          @mouseout=${() => {
            this.dispatchEvent(new ItemMouseOutEvent(node));
          }}
        >
          <span class="arrow-icon" @click=${this.#onArrowClick(node)} jslog=${VisualLogging.expand().track({click: true})}>
          </span>
          <span class="tree-node-key" data-node-key=${node.treeNodeData}>${renderedNodeKey}</span>
        </span>
        ${childrenToRender}
      </li>
    `;
    // clang-format on
  }

  async #render(): Promise<void> {
    if (this.#scheduledRender) {
      // If we are already rendering, don't render again immediately, but
      // enqueue it to be run after we're done on our current render.
      this.#enqueuedRender = true;
      return;
    }

    this.#scheduledRender = true;

    await RenderCoordinator.write('TreeOutline render', () => {
      // Disabled until https://crbug.com/1079231 is fixed.
      // clang-format off
      // Unfortunately the TreeOutline web component adds the
      // tree element into its own shadow DOM, so these don't
      // inherit the surrounding (common) styles. But we need
      // the common button styles at least (e.g. to fix the
      // cause of http://crbug.com/435601104). Long-term the
      // tree elements shouldn't be inside the TreeOutline's
      // shadow DOM.
      Lit.render(html`
      <style>${Buttons.textButtonStyles}</style>
      <style>${UI.inspectorCommonStyles}</style>
      <style>${treeOutlineStyles}</style>
      <style>${CodeHighlighter.codeHighlighterStyles}</style>
      <div class="wrapping-container">
        <ul role="tree" @keydown=${this.#onTreeKeyDown}>
          ${this.#treeData.map((topLevelNode, index) => {
            return this.#renderNode(topLevelNode, {
              depth: 0,
              setSize: this.#treeData.length,
              positionInSet: index,
            });
          })}
        </ul>
      </div>
      `, this.#shadow, {
        host: this,
      });
    });
    // clang-format on
    this.#hasRenderedAtLeastOnce = true;
    this.#scheduledRender = false;

    // If render() was called when we were already mid-render, let's re-render
    // to ensure we're not rendering any stale UI.
    if (this.#enqueuedRender) {
      this.#enqueuedRender = false;
      return await this.#render();
    }
  }
}

customElements.define('devtools-tree-outline', TreeOutline);

declare global {
  interface HTMLElementTagNameMap {
    'devtools-tree-outline': TreeOutline<unknown>;
  }
}
