# Parsing UserTimings

UserTimings can be performance or console timings. They have the `cat` of `blink.user_timing` or `blink.console`.

## Performance timings

These have the category `blink.user_timing`. This category is overloaded and in actual fact there are three distinct types of events that have this category:
### 1. Injected timings
Chrome will inject some timings that have this category. These align with the Performance Navigation Timing API [https://www.w3.org/TR/navigation-timing-2/#sec-PerformanceNavigationTiming] and the Resource Timing API [https://www.w3.org/TR/resource-timing-2/#sec-performanceresourcetiming].

When working with user timings we have to be careful to filter out any events that aren't actually user timings generated by calls to `performance.mark` or `performance.measure`. This filtering happens at the UserTimingsHandler level.

### 2. Performance mark calls
If the user has code such as `const foo = performance.mark('foo')`, that will generate a single event in the trace file. We use this to give us a list of all marks that were created.

### 3. Pairs of begin/end events for `performance.measure` calls

Events that represent a `performance.measure` call will come in pairs: a begin event, and an end event. These are always asynchronous events, and have the `phase` of `b` or `e`. We can pair these events by using their `id` field, which is the same for the begin and end event. It is impossible for a trace to have a begin event without an end event, or vice-versa.


### Parsing out user timings

For `performance.mark` calls, the handler looks for events with the user timing category and the `Mark` trace event phase (`I`). However, pre-June 2023, these are emitted with phase `R`. These events are then filtered to exclude timings appended by Chrome (1).

For `performance.measure` calls, the handler looks for begin or end events in the trace. Once we have these, we then pair them up, and create a list of synthetic user timing events. These are events that do not actually exist in the trace, but we create because we need one event to map to each block. The event is made up of information from the begin and/or end event and includes most crucially:

* The string `id` of the block (shared with the begin and end events)
* The `name` of the block - which will be the text the user passed to `performance.measure`. For example, `performance.measure('foo', someMark)` will cause the `name` to be `'foo'`.
* The timestamp (`ts`) which is set to the timestamp of the `begin` event.
* The duration (`dur`) which is set to the `end` event timestamp minus the `begin` event timestamp.
* The source `begin` & `end` events under `args.data`

## Console timings

These have the category `blink.console`.

These come from the following calls to the console API:

* console.time(), console.timeStart()
* console.timeLog()
* console.timeStamp()
* console.timeEnd()

Depending on which is used, instant events or async events with a duration are triggered.
