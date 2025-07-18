# Chromium DevTools UI Engineering

## Objective and scope

This document defines how to build Chromium DevTools UI. It aims at improving consistency, maintainability and extensibility of the current code

**Consistency** here means to have one way to do one thing, in the context of this doc to have a single reusable component per repeated task.

**Maintainability** is addressed here through the [separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) while avoiding unnecessary indirection.

**Extensibility** requires the ease of understanding and imitation, i.e. being able to take an existing code, understand and use it as an example to solve another problem.

Additionally, all the changes need to be applicable to the existing code **point-wise** instead of requiring extensive rewriting.

## Reusable web components

Common UI primitives need to be implemented as web components. Examples include buttons, checkboxs, or data grids. Web components should not be used solely for encapsulation, we should not have single-use web components.

Not all reusable code should be a web component: in the Application panel we have several similar views showing key-value pairs in a datagrid with a preview sidebar. Making this a truly reusable component will lead to an unjustifiable complexity. Instead we should have extracted a base class or helpers implementing the common functionality.

In implementation we should prefer wrapping existing code under ui/legacy over new implementation. The former is the most feature-rich (including less obvious aspects like a11y) and has stood the test of time.

We should however strive to expose a “HTML-native” API: e.g. toolbar doesn’t need an `items` setter if its child HTML elements could define its content. Even the data grid doesn’t need to expose data grid nodes, when `<tr>` and `<td>`’s are enough.

## Model-View-Presenter architecture

We should strictly separate business logic, from UI logic and presentation. This means that most of the UI code should be centered around a presenter (subclass of a `UI.Widget`) that gets a view function injected. All the logic that is not related to the DevTools UI (i.e. that would stay the same if we rewrite DevTools as a command-line tool), should belong to the model layer.

The presenter code should make no assumptions about the details of model or view code. It should not care what race conditions CDP exposes or how many layers of `<div class=”wrapper”>` does the markup have. However, for simplicity, the injected view function should have a default implementation inlined with a presenter (see an example below).

In tests, we use a simple stub as a view function, which allows us to test the presenter logic without any DOM manipulation. To test the view function itself we should use screenshot and e2e tests.

## Declarative and orchestrated DOM updates

We should no longer use imperative API to update DOM. Instead we rely on orchestrated rendering of lit-html templates. The view function described above should be a call to lit-html `render`. The view function should be called from `UI.Widget`’s `performUpdate` method, which by default is scheduled using `requestAnimationFrame`.

To embed another presenter (`UI.Widget`) in the lit-html template, use `<devtools-widget .widgetConfig=${widgetConfig(<class>, {foo: 1, bar: 2})}`

This will instantiate a `Widget` class with the web component as its `element` and, optionally, will set the properties provided in the second parameter. The widget won’t be re-instantiated on the subsequent template renders, but the properties would be updated. For this to work, the widget needs to accept `HTMLElement` as a sole constructor parameter and properties need to be public members or setters.

For backwards compatibility, the first argument to `widgetConfig` can also be a factory function: `<devtools-widget .widgetConfig=${widgetConfig(element => new MyWidget(foo, bar, element))}>`. Similar to the class constructor version, `element` is the actual `<devtools-widget>` so the following two invocations of `widgetConfig` are equivalent: `widgetConfig(MyWidget)` and `widgetConfig(element = new MyWidget(element))`.

## Styling
To prevent style conflicts in widgets without relying on shadow DOM, we use the CSS [`@scope`](https://developer.mozilla.org/en-US/docs/Web/CSS/@scope) at-rule for style encapsulation. This ensures that styles defined for a widget do not leak out and affect other components.

To simplify this process, a helper function, `UI.Widget.widgetScoped`, is provided. This function automatically wraps the given CSS rules in an `@scope to (devtools-widget)` block. The to (devtools-widget) part is crucial, as it establishes a "lower boundary," preventing the styles from cascading into any nested child widgets (which are rendered as <devtools-widget> elements).

```ts
import {html} from 'lit-html';
import * as UI from '../../ui/legacy/legacy.js';
import myWidgetStyles from './myWidget.css.js';

render(html`
  <style>
    ${UI.Widget.widgetScoped(myWidgetStyles)}
  </style>
  <div class="container">
    <h3 class="title">My Widget</h3>
    ...
    <devtools-widget .widgetConfig=${widgetConfig(NestedWidget)}></devtools-widget>
  </div>
`, this.element);
```

In this example, styles like `.title` will apply within the parent widget but will not apply to any elements inside the nested `<devtools-widget>`.

## Examples

```html
<devtools-widget .widgetConfig=${widgetConfig(ElementsPanel)}>
  <devtools-split-view>
    <devtools-widget slot="main" .widgetConfig=${widgetConfig(ElementsTree)}></devtools-widget>
    <devtools-tab-pane slot="sidebar">
      <devtools-widget .widgetConfig=${widgetConfig(StylesPane, {element: input.element})}></devtools-widget>
      <devtools-widget .widgetConfig=${widgetConfig(ComputedPane, {element: input.element})}></devtools-widget>
      ...
    </devtools-tab-pane>
  </devtools-split-view>
</devtools-widget>
```

```ts
class StylesPane extends UI.Widget {
  constructor(element, view = (input, output, target) => {
    render(html`
      <devtools-widget .widgetConfig=${widgetConfig(MetricsPane, {element: input.element})}>
      </devtools-widget>
      <devtools-toolbar>
        <devtools-filter-input @change=${input.onFilter}></devtools-filter-input>
        <devtools-checkbox @change=${input.onShowAll}>Show All</devtools-checkbox>
        <devtools-checkbox @change=${input.onGroup}>Group</devtools-checkbox>
      </devtools-toolbar>
      <devtools-tree-outline>
        ${input.properties.map(p => html`<li>
          <dt>${p.key}</dt><dd>${renderValue(p.value)}</dd>
          <ol>${p.subproperties.map(...)}
          </li>`)}
      </devtools-tree-outline>`
  }
}
```

[https://source.chromium.org/chromium/chromium/src/+/main:third\_party/devtools-frontend/src/front\_end/panels/protocol\_monitor/ProtocolMonitor.ts;l=197](https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/panels/protocol_monitor/ProtocolMonitor.ts;l=197)

[https://source.chromium.org/chromium/chromium/src/+/main:third\_party/devtools-frontend/src/front\_end/panels/developer\_resources/DeveloperResourcesListView.ts;l=86](https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/panels/developer_resources/DeveloperResourcesListView.ts;l=86)

[https://source.chromium.org/chromium/chromium/src/+/main:third\_party/devtools-frontend/src/front\_end/panels/timeline/TimelineSelectorStatsView.ts;l=113](https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/panels/timeline/TimelineSelectorStatsView.ts;l=113)


### Unit tests

When testing presenters, rely on observable effects such as view updates or model calls.

#### View stubbing

```ts
// ✅ recommended: stub the view function using createViewFunctionStub.
import {createViewFunctionStub} from './ViewFunctionHelpers.js';
const view = createViewFunctionStub(Presenter);
const presenter = new Presenter(view);

// ✅ recommended: expect a view stub call in response to presenter behavior.
present.show();
const input = await view.nextInput;

// ✅ recommended: expect a view stub call in response to an event from the view.
input.onEvent();
assert.deepStrictEqual(await view.nextInput, {});

// ❌ not recommended: Widget.updateComplete only reports a current view update
// operation status and might create flakiness depending on doSomething() implementation.
presenter.doSomething();
await presenter.updateComplete;
assert.deepStrictEqual(view.lastCall.args[0], {});

// ❌ not recommended: awaiting for the present logic to finish might
// not account for async or throttled view updates.
await presenter.doSomething();
// ❌ not recommended: it is easy for such assertions to
// rely on the data not caused by the action being tested.
sinon.assert.calledWith(view, sinon.match({ data: 'smth' }));
```

#### Model stubbing

```ts
// ✅ recommended: stub models that the presenter relies on.
// Note there are many good ways to stub/mock models with sinon
// depending on the use case and existing model code structure.
const cssModel = sinon.createStubInstance(SDK.CSSModel.CSSModel);

const presenter = new Presenter();
// ✅ recommended: expect model calls as the result of invoking
// presenter's logic.
const modelCall = expectCall(cssModel.headersForSourceURL, {
  fakeFn: () => {
    return false,
  },
});
// ✅ recommended: expect view calls to result in output based
// on the mocked model.
const viewCall = view.nextInput;

presenter.doSomething();

// ✅ recommended: assert arguments provided to model calls.
const [url] = await modelCall;
assert.strictEqual(url, '...');

assert.deepStrictEqual((await viewCall).headersForSourceURL, [{...}]);

// ❌ not recommended: mocking CDP responses to make the models behave in a certain way
// while testing a presenter is fragile.
setMockConnectionResponseHandler('CSS.getHeaders', () => ({}));
const presenter = new Presenter();
presenter.doSomething();
```
