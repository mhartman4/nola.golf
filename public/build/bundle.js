var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function get_root_for_style(node) {
        if (!node)
            return document;
        const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
        if (root && root.host) {
            return root;
        }
        return node.ownerDocument;
    }
    function append_empty_stylesheet(node) {
        const style_element = element('style');
        append_stylesheet(get_root_for_style(node), style_element);
        return style_element.sheet;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
        return style.sheet;
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    // we need to store the information for multiple documents because a Svelte application could also contain iframes
    // https://github.com/sveltejs/svelte/issues/3624
    const managed_styles = new Map();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_style_information(doc, node) {
        const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
        managed_styles.set(doc, info);
        return info;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = get_root_for_style(node);
        const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
        if (!rules[name]) {
            rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            managed_styles.forEach(info => {
                const { ownerNode } = info.stylesheet;
                // there is no ownerNode if it runs on jsdom.
                if (ownerNode)
                    detach(ownerNode);
            });
            managed_styles.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.50.1' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src/Picker.svelte generated by Svelte v3.50.1 */
    const file$c = "src/Picker.svelte";

    function get_each_context$8(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (16:1) {#each pages as page}
    function create_each_block$8(ctx) {
    	let span;
    	let t0_value = /*page*/ ctx[4] + "";
    	let t0;
    	let t1;
    	let span_class_value;
    	let span_href_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();

    			attr_dev(span, "class", span_class_value = "picker-option " + (/*activePage*/ ctx[0] === /*page*/ ctx[4]
    			? ' selected'
    			: '') + " " + (/*dvLeague*/ ctx[2] ? ' comic' : '') + " svelte-1i3wrp0");

    			attr_dev(span, "href", span_href_value = "#" + /*page*/ ctx[4]);
    			add_location(span, file$c, 16, 2, 356);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t0);
    			append_dev(span, t1);

    			if (!mounted) {
    				dispose = listen_dev(
    					span,
    					"click",
    					function () {
    						if (is_function(/*handleClick*/ ctx[3](/*page*/ ctx[4]))) /*handleClick*/ ctx[3](/*page*/ ctx[4]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*pages*/ 2 && t0_value !== (t0_value = /*page*/ ctx[4] + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*activePage, pages*/ 3 && span_class_value !== (span_class_value = "picker-option " + (/*activePage*/ ctx[0] === /*page*/ ctx[4]
    			? ' selected'
    			: '') + " " + (/*dvLeague*/ ctx[2] ? ' comic' : '') + " svelte-1i3wrp0")) {
    				attr_dev(span, "class", span_class_value);
    			}

    			if (dirty & /*pages*/ 2 && span_href_value !== (span_href_value = "#" + /*page*/ ctx[4])) {
    				attr_dev(span, "href", span_href_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$8.name,
    		type: "each",
    		source: "(16:1) {#each pages as page}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$c(ctx) {
    	let div;
    	let each_value = /*pages*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$8(get_each_context$8(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "picker svelte-1i3wrp0");
    			add_location(div, file$c, 14, 0, 310);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*activePage, pages, dvLeague, handleClick*/ 15) {
    				each_value = /*pages*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$8(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$8(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Picker', slots, []);
    	let { pages = [] } = $$props;
    	let { activePage } = $$props;
    	let dvLeague = window.location.href.includes("?league=dv");

    	onMount(() => {
    		// Set default tab value
    		$$invalidate(0, activePage = pages[0]);
    	});

    	const handleClick = tabValue => () => $$invalidate(0, activePage = tabValue);
    	const writable_props = ['pages', 'activePage'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Picker> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('pages' in $$props) $$invalidate(1, pages = $$props.pages);
    		if ('activePage' in $$props) $$invalidate(0, activePage = $$props.activePage);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		pages,
    		activePage,
    		dvLeague,
    		handleClick
    	});

    	$$self.$inject_state = $$props => {
    		if ('pages' in $$props) $$invalidate(1, pages = $$props.pages);
    		if ('activePage' in $$props) $$invalidate(0, activePage = $$props.activePage);
    		if ('dvLeague' in $$props) $$invalidate(2, dvLeague = $$props.dvLeague);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [activePage, pages, dvLeague, handleClick];
    }

    class Picker extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { pages: 1, activePage: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Picker",
    			options,
    			id: create_fragment$c.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*activePage*/ ctx[0] === undefined && !('activePage' in props)) {
    			console.warn("<Picker> was created without expected prop 'activePage'");
    		}
    	}

    	get pages() {
    		throw new Error("<Picker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pages(value) {
    		throw new Error("<Picker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activePage() {
    		throw new Error("<Picker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activePage(value) {
    		throw new Error("<Picker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function slide(node, { delay = 0, duration = 400, easing = cubicOut } = {}) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => 'overflow: hidden;' +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }

    /* src/Roster.svelte generated by Svelte v3.50.1 */
    const file$b = "src/Roster.svelte";

    function get_each_context$7(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i];
    	return child_ctx;
    }

    // (20:3) {#each roster as player}
    function create_each_block$7(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*player*/ ctx[2].name + "";
    	let t0;
    	let t1;
    	let td1;

    	let t2_value = (/*player*/ ctx[2].position
    	? numeral(/*player*/ ctx[2].projMoney).format("$0,0")
    	: "") + "";

    	let t2;
    	let t3;
    	let td2;

    	let t4_value = (/*player*/ ctx[2].isPlaying
    	? /*player*/ ctx[2].position
    		? /*player*/ ctx[2].position
    		: /*player*/ ctx[2].pgaStatus === "wd"
    			? "WD"
    			: /*player*/ ctx[2].pgaStatus == "active" ? "" : "CUT"
    	: "") + "";

    	let t4;
    	let t5;
    	let td3;

    	let t6_value = (/*player*/ ctx[2].position
    	? /*player*/ ctx[2].total ? /*player*/ ctx[2].total : "E"
    	: "") + "";

    	let t6;
    	let t7;
    	let td4;

    	let t8_value = (/*player*/ ctx[2].today == null
    	? /*player*/ ctx[2].pgaStatus == "active"
    		? /*player*/ ctx[2].firstRoundTeeTime
    		: ""
    	: /*player*/ ctx[2].today != undefined
    		? /*player*/ ctx[2].today == 0
    			? "E"
    			: /*player*/ ctx[2].today
    		: "") + "";

    	let t8;
    	let t9;
    	let td5;
    	let t10_value = (/*player*/ ctx[2].thru ? /*player*/ ctx[2].thru : "") + "";
    	let t10;
    	let tr_class_value;
    	let t11;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = space();
    			td3 = element("td");
    			t6 = text(t6_value);
    			t7 = space();
    			td4 = element("td");
    			t8 = text(t8_value);
    			t9 = space();
    			td5 = element("td");
    			t10 = text(t10_value);
    			t11 = space();
    			attr_dev(td0, "class", "svelte-15crnt1");
    			add_location(td0, file$b, 22, 6, 739);
    			attr_dev(td1, "class", "svelte-15crnt1");
    			add_location(td1, file$b, 23, 21, 783);
    			attr_dev(td2, "class", "svelte-15crnt1");
    			add_location(td2, file$b, 24, 21, 879);
    			attr_dev(td3, "class", "svelte-15crnt1");
    			add_location(td3, file$b, 25, 21, 1054);
    			attr_dev(td4, "class", "svelte-15crnt1");
    			add_location(td4, file$b, 26, 21, 1145);
    			attr_dev(td5, "class", "svelte-15crnt1");
    			add_location(td5, file$b, 27, 21, 1341);
    			attr_dev(tr, "class", tr_class_value = "player-row" + (/*player*/ ctx[2].isPlaying ? '' : ' inactive') + (/*player*/ ctx[2].secondTourney ? ' second-tourney' : '') + (' ' + /*player*/ ctx[2].pgaStatus) + " " + /*player*/ ctx[2].league + " svelte-15crnt1");
    			add_location(tr, file$b, 21, 5, 585);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(tr, t3);
    			append_dev(tr, td2);
    			append_dev(td2, t4);
    			append_dev(tr, t5);
    			append_dev(tr, td3);
    			append_dev(td3, t6);
    			append_dev(tr, t7);
    			append_dev(tr, td4);
    			append_dev(td4, t8);
    			append_dev(tr, t9);
    			append_dev(tr, td5);
    			append_dev(td5, t10);
    			insert_dev(target, t11, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*roster*/ 1 && t0_value !== (t0_value = /*player*/ ctx[2].name + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*roster*/ 1 && t2_value !== (t2_value = (/*player*/ ctx[2].position
    			? numeral(/*player*/ ctx[2].projMoney).format("$0,0")
    			: "") + "")) set_data_dev(t2, t2_value);

    			if (dirty & /*roster*/ 1 && t4_value !== (t4_value = (/*player*/ ctx[2].isPlaying
    			? /*player*/ ctx[2].position
    				? /*player*/ ctx[2].position
    				: /*player*/ ctx[2].pgaStatus === "wd"
    					? "WD"
    					: /*player*/ ctx[2].pgaStatus == "active" ? "" : "CUT"
    			: "") + "")) set_data_dev(t4, t4_value);

    			if (dirty & /*roster*/ 1 && t6_value !== (t6_value = (/*player*/ ctx[2].position
    			? /*player*/ ctx[2].total ? /*player*/ ctx[2].total : "E"
    			: "") + "")) set_data_dev(t6, t6_value);

    			if (dirty & /*roster*/ 1 && t8_value !== (t8_value = (/*player*/ ctx[2].today == null
    			? /*player*/ ctx[2].pgaStatus == "active"
    				? /*player*/ ctx[2].firstRoundTeeTime
    				: ""
    			: /*player*/ ctx[2].today != undefined
    				? /*player*/ ctx[2].today == 0
    					? "E"
    					: /*player*/ ctx[2].today
    				: "") + "")) set_data_dev(t8, t8_value);

    			if (dirty & /*roster*/ 1 && t10_value !== (t10_value = (/*player*/ ctx[2].thru ? /*player*/ ctx[2].thru : "") + "")) set_data_dev(t10, t10_value);

    			if (dirty & /*roster*/ 1 && tr_class_value !== (tr_class_value = "player-row" + (/*player*/ ctx[2].isPlaying ? '' : ' inactive') + (/*player*/ ctx[2].secondTourney ? ' second-tourney' : '') + (' ' + /*player*/ ctx[2].pgaStatus) + " " + /*player*/ ctx[2].league + " svelte-15crnt1")) {
    				attr_dev(tr, "class", tr_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			if (detaching) detach_dev(t11);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$7.name,
    		type: "each",
    		source: "(20:3) {#each roster as player}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let div;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t1;
    	let th1;
    	let t3;
    	let th2;
    	let t5;
    	let th3;
    	let t7;
    	let th4;
    	let t9;
    	let th5;
    	let t11;
    	let tbody;
    	let div_transition;
    	let current;
    	let each_value = /*roster*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$7(get_each_context$7(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Golfer";
    			t1 = space();
    			th1 = element("th");
    			th1.textContent = "Proj. $";
    			t3 = space();
    			th2 = element("th");
    			th2.textContent = "Pos";
    			t5 = space();
    			th3 = element("th");
    			th3.textContent = "Total";
    			t7 = space();
    			th4 = element("th");
    			th4.textContent = "Today";
    			t9 = space();
    			th5 = element("th");
    			th5.textContent = "Thru";
    			t11 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(th0, "class", "roster-header svelte-15crnt1");
    			add_location(th0, file$b, 10, 4, 184);
    			attr_dev(th1, "class", "roster-header svelte-15crnt1");
    			add_location(th1, file$b, 11, 16, 238);
    			attr_dev(th2, "class", "roster-header svelte-15crnt1");
    			add_location(th2, file$b, 12, 16, 293);
    			attr_dev(th3, "class", "roster-header svelte-15crnt1");
    			add_location(th3, file$b, 13, 16, 344);
    			attr_dev(th4, "class", "roster-header svelte-15crnt1");
    			add_location(th4, file$b, 14, 16, 397);
    			attr_dev(th5, "class", "roster-header svelte-15crnt1");
    			add_location(th5, file$b, 15, 16, 450);
    			add_location(tr, file$b, 9, 3, 175);
    			add_location(thead, file$b, 8, 2, 164);
    			add_location(tbody, file$b, 18, 2, 508);
    			attr_dev(table, "class", "roster-table svelte-15crnt1");
    			add_location(table, file$b, 7, 1, 133);
    			attr_dev(div, "class", "roster svelte-15crnt1");
    			add_location(div, file$b, 6, 0, 94);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t1);
    			append_dev(tr, th1);
    			append_dev(tr, t3);
    			append_dev(tr, th2);
    			append_dev(tr, t5);
    			append_dev(tr, th3);
    			append_dev(tr, t7);
    			append_dev(tr, th4);
    			append_dev(tr, t9);
    			append_dev(tr, th5);
    			append_dev(table, t11);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*roster, undefined, numeral*/ 1) {
    				each_value = /*roster*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$7(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$7(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Roster', slots, []);
    	let { roster, teamName } = $$props;
    	const writable_props = ['roster', 'teamName'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Roster> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('roster' in $$props) $$invalidate(0, roster = $$props.roster);
    		if ('teamName' in $$props) $$invalidate(1, teamName = $$props.teamName);
    	};

    	$$self.$capture_state = () => ({ slide, roster, teamName });

    	$$self.$inject_state = $$props => {
    		if ('roster' in $$props) $$invalidate(0, roster = $$props.roster);
    		if ('teamName' in $$props) $$invalidate(1, teamName = $$props.teamName);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [roster, teamName];
    }

    class Roster extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { roster: 0, teamName: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Roster",
    			options,
    			id: create_fragment$b.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*roster*/ ctx[0] === undefined && !('roster' in props)) {
    			console.warn("<Roster> was created without expected prop 'roster'");
    		}

    		if (/*teamName*/ ctx[1] === undefined && !('teamName' in props)) {
    			console.warn("<Roster> was created without expected prop 'teamName'");
    		}
    	}

    	get roster() {
    		throw new Error("<Roster>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set roster(value) {
    		throw new Error("<Roster>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get teamName() {
    		throw new Error("<Roster>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set teamName(value) {
    		throw new Error("<Roster>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Team.svelte generated by Svelte v3.50.1 */
    const file$a = "src/Team.svelte";

    // (43:6) {#if activeGolferCounts["pga"] > 0}
    function create_if_block_3$2(ctx) {
    	let span;
    	let t_value = /*activeGolferCounts*/ ctx[3]["pga"] + "";
    	let t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr_dev(span, "class", "golfer-count pga svelte-g5jadf");
    			add_location(span, file$a, 43, 8, 1490);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*activeGolferCounts*/ 8 && t_value !== (t_value = /*activeGolferCounts*/ ctx[3]["pga"] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$2.name,
    		type: "if",
    		source: "(43:6) {#if activeGolferCounts[\\\"pga\\\"] > 0}",
    		ctx
    	});

    	return block;
    }

    // (46:7) {#if activeGolferCounts["liv"] > 0}
    function create_if_block_2$3(ctx) {
    	let span;
    	let t_value = /*activeGolferCounts*/ ctx[3]["liv"] + "";
    	let t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr_dev(span, "class", "golfer-count liv svelte-g5jadf");
    			add_location(span, file$a, 46, 8, 1620);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*activeGolferCounts*/ 8 && t_value !== (t_value = /*activeGolferCounts*/ ctx[3]["liv"] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$3.name,
    		type: "if",
    		source: "(46:7) {#if activeGolferCounts[\\\"liv\\\"] > 0}",
    		ctx
    	});

    	return block;
    }

    // (49:7) {#if activeGolferCounts["eur"] > 0}
    function create_if_block_1$4(ctx) {
    	let span;
    	let t_value = /*activeGolferCounts*/ ctx[3]["eur"] + "";
    	let t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr_dev(span, "class", "golfer-count eur svelte-g5jadf");
    			add_location(span, file$a, 49, 8, 1750);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*activeGolferCounts*/ 8 && t_value !== (t_value = /*activeGolferCounts*/ ctx[3]["eur"] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$4.name,
    		type: "if",
    		source: "(49:7) {#if activeGolferCounts[\\\"eur\\\"] > 0}",
    		ctx
    	});

    	return block;
    }

    // (62:1) {#if rosterVisible}
    function create_if_block$7(ctx) {
    	let roster;
    	let current;

    	roster = new Roster({
    			props: {
    				roster: /*team*/ ctx[0].roster,
    				teamName: /*team*/ ctx[0].teamName
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(roster.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(roster, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const roster_changes = {};
    			if (dirty & /*team*/ 1) roster_changes.roster = /*team*/ ctx[0].roster;
    			if (dirty & /*team*/ 1) roster_changes.teamName = /*team*/ ctx[0].teamName;
    			roster.$set(roster_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(roster.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(roster.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(roster, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$7.name,
    		type: "if",
    		source: "(62:1) {#if rosterVisible}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let div2;
    	let div1;
    	let table;
    	let tbody;
    	let tr;
    	let td0;
    	let t0;
    	let t1;
    	let td1;
    	let img;
    	let img_src_value;
    	let t2;
    	let td2;
    	let t3_value = /*team*/ ctx[0].teamName + "";
    	let t3;
    	let t4;
    	let div0;
    	let t5_value = /*team*/ ctx[0].owner + "";
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let td2_class_value;
    	let t9;
    	let td3;
    	let t10_value = numeral(/*team*/ ctx[0].totalMoney).format('$0,0') + "";
    	let t10;
    	let br;
    	let td3_class_value;
    	let t11;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*activeGolferCounts*/ ctx[3]["pga"] > 0 && create_if_block_3$2(ctx);
    	let if_block1 = /*activeGolferCounts*/ ctx[3]["liv"] > 0 && create_if_block_2$3(ctx);
    	let if_block2 = /*activeGolferCounts*/ ctx[3]["eur"] > 0 && create_if_block_1$4(ctx);
    	let if_block3 = /*rosterVisible*/ ctx[4] && create_if_block$7(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			table = element("table");
    			tbody = element("tbody");
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(/*placeNumber*/ ctx[1]);
    			t1 = space();
    			td1 = element("td");
    			img = element("img");
    			t2 = space();
    			td2 = element("td");
    			t3 = text(t3_value);
    			t4 = space();
    			div0 = element("div");
    			t5 = text(t5_value);
    			t6 = text("  \n\t\t\t\t\t\t");
    			if (if_block0) if_block0.c();
    			t7 = space();
    			if (if_block1) if_block1.c();
    			t8 = space();
    			if (if_block2) if_block2.c();
    			t9 = space();
    			td3 = element("td");
    			t10 = text(t10_value);
    			br = element("br");
    			t11 = space();
    			if (if_block3) if_block3.c();
    			attr_dev(td0, "class", "standings-place-number svelte-g5jadf");
    			attr_dev(td0, "width", "15");
    			add_location(td0, file$a, 33, 5, 954);
    			attr_dev(img, "class", "player-photo svelte-g5jadf");
    			if (!src_url_equal(img.src, img_src_value = "https://pga-tour-res.cloudinary.com/image/upload/c_fill,dpr_2.0,f_auto,g_face:center,h_45,q_auto,t_headshots_leaderboard_l,w_45/headshots_" + /*team*/ ctx[0].roster[0].id + ".png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "width", "45");
    			attr_dev(img, "height", "45");
    			add_location(img, file$a, 35, 6, 1046);
    			attr_dev(td1, "width", "55");
    			add_location(td1, file$a, 34, 5, 1024);
    			attr_dev(div0, "class", "owner " + (/*dvLeague*/ ctx[5] ? " invisible" : "") + " svelte-g5jadf");
    			add_location(div0, file$a, 41, 6, 1365);
    			attr_dev(td2, "class", td2_class_value = "team-name " + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-g5jadf");
    			add_location(td2, file$a, 38, 5, 1281);
    			add_location(br, file$a, 55, 47, 1971);
    			attr_dev(td3, "class", td3_class_value = "team-earnings " + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-g5jadf");
    			add_location(td3, file$a, 54, 5, 1865);
    			add_location(tr, file$a, 32, 4, 944);
    			add_location(tbody, file$a, 31, 3, 932);
    			attr_dev(table, "border", "0");
    			attr_dev(table, "width", "100%");
    			add_location(table, file$a, 30, 2, 897);
    			attr_dev(div1, "class", "header svelte-g5jadf");
    			add_location(div1, file$a, 29, 1, 850);
    			attr_dev(div2, "class", "team");
    			add_location(div2, file$a, 28, 0, 830);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, table);
    			append_dev(table, tbody);
    			append_dev(tbody, tr);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, img);
    			append_dev(tr, t2);
    			append_dev(tr, td2);
    			append_dev(td2, t3);
    			append_dev(td2, t4);
    			append_dev(td2, div0);
    			append_dev(div0, t5);
    			append_dev(div0, t6);
    			if (if_block0) if_block0.m(div0, null);
    			append_dev(div0, t7);
    			if (if_block1) if_block1.m(div0, null);
    			append_dev(div0, t8);
    			if (if_block2) if_block2.m(div0, null);
    			append_dev(tr, t9);
    			append_dev(tr, td3);
    			append_dev(td3, t10);
    			append_dev(td3, br);
    			append_dev(div2, t11);
    			if (if_block3) if_block3.m(div2, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div1, "click", /*toggleRoster*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*placeNumber*/ 2) set_data_dev(t0, /*placeNumber*/ ctx[1]);

    			if (!current || dirty & /*team*/ 1 && !src_url_equal(img.src, img_src_value = "https://pga-tour-res.cloudinary.com/image/upload/c_fill,dpr_2.0,f_auto,g_face:center,h_45,q_auto,t_headshots_leaderboard_l,w_45/headshots_" + /*team*/ ctx[0].roster[0].id + ".png")) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if ((!current || dirty & /*team*/ 1) && t3_value !== (t3_value = /*team*/ ctx[0].teamName + "")) set_data_dev(t3, t3_value);
    			if ((!current || dirty & /*team*/ 1) && t5_value !== (t5_value = /*team*/ ctx[0].owner + "")) set_data_dev(t5, t5_value);

    			if (/*activeGolferCounts*/ ctx[3]["pga"] > 0) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3$2(ctx);
    					if_block0.c();
    					if_block0.m(div0, t7);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*activeGolferCounts*/ ctx[3]["liv"] > 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$3(ctx);
    					if_block1.c();
    					if_block1.m(div0, t8);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*activeGolferCounts*/ ctx[3]["eur"] > 0) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1$4(ctx);
    					if_block2.c();
    					if_block2.m(div0, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (!current || dirty & /*isFavorite*/ 4 && td2_class_value !== (td2_class_value = "team-name " + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-g5jadf")) {
    				attr_dev(td2, "class", td2_class_value);
    			}

    			if ((!current || dirty & /*team*/ 1) && t10_value !== (t10_value = numeral(/*team*/ ctx[0].totalMoney).format('$0,0') + "")) set_data_dev(t10, t10_value);

    			if (!current || dirty & /*isFavorite*/ 4 && td3_class_value !== (td3_class_value = "team-earnings " + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-g5jadf")) {
    				attr_dev(td3, "class", td3_class_value);
    			}

    			if (/*rosterVisible*/ ctx[4]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty & /*rosterVisible*/ 16) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block$7(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div2, null);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block3);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block3);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Team', slots, []);
    	let { team, placeNumber, isFavorite, activeGolferCounts } = $$props;
    	team.roster = team.roster.sort((a, b) => b.sort - a.sort);

    	// let teamName = team.name
    	// let teamNameNoOwner = team.teamName
    	// let owner = team.owner
    	// let pictureUrl = "https://pga-tour-res.cloudinary.com/image/upload/c_fill,dpr_2.0,f_auto,g_face:center,h_45,q_auto,t_headshots_leaderboard_l,w_45/headshots_" + team.roster[0].id + ".png"
    	let rosterVisible = false;

    	let dvLeague = window.location.href.includes("?league=dv");

    	function toggleRoster() {
    		$$invalidate(4, rosterVisible = !rosterVisible);
    		//  		hitType: 'event',
    	} //  		eventCategory: 'Weekly',
    	//  		eventAction: 'Click Team',

    	const writable_props = ['team', 'placeNumber', 'isFavorite', 'activeGolferCounts'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Team> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('team' in $$props) $$invalidate(0, team = $$props.team);
    		if ('placeNumber' in $$props) $$invalidate(1, placeNumber = $$props.placeNumber);
    		if ('isFavorite' in $$props) $$invalidate(2, isFavorite = $$props.isFavorite);
    		if ('activeGolferCounts' in $$props) $$invalidate(3, activeGolferCounts = $$props.activeGolferCounts);
    	};

    	$$self.$capture_state = () => ({
    		Roster,
    		team,
    		placeNumber,
    		isFavorite,
    		activeGolferCounts,
    		rosterVisible,
    		dvLeague,
    		toggleRoster
    	});

    	$$self.$inject_state = $$props => {
    		if ('team' in $$props) $$invalidate(0, team = $$props.team);
    		if ('placeNumber' in $$props) $$invalidate(1, placeNumber = $$props.placeNumber);
    		if ('isFavorite' in $$props) $$invalidate(2, isFavorite = $$props.isFavorite);
    		if ('activeGolferCounts' in $$props) $$invalidate(3, activeGolferCounts = $$props.activeGolferCounts);
    		if ('rosterVisible' in $$props) $$invalidate(4, rosterVisible = $$props.rosterVisible);
    		if ('dvLeague' in $$props) $$invalidate(5, dvLeague = $$props.dvLeague);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		team,
    		placeNumber,
    		isFavorite,
    		activeGolferCounts,
    		rosterVisible,
    		dvLeague,
    		toggleRoster
    	];
    }

    class Team extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			team: 0,
    			placeNumber: 1,
    			isFavorite: 2,
    			activeGolferCounts: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Team",
    			options,
    			id: create_fragment$a.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*team*/ ctx[0] === undefined && !('team' in props)) {
    			console.warn("<Team> was created without expected prop 'team'");
    		}

    		if (/*placeNumber*/ ctx[1] === undefined && !('placeNumber' in props)) {
    			console.warn("<Team> was created without expected prop 'placeNumber'");
    		}

    		if (/*isFavorite*/ ctx[2] === undefined && !('isFavorite' in props)) {
    			console.warn("<Team> was created without expected prop 'isFavorite'");
    		}

    		if (/*activeGolferCounts*/ ctx[3] === undefined && !('activeGolferCounts' in props)) {
    			console.warn("<Team> was created without expected prop 'activeGolferCounts'");
    		}
    	}

    	get team() {
    		throw new Error("<Team>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set team(value) {
    		throw new Error("<Team>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeNumber() {
    		throw new Error("<Team>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeNumber(value) {
    		throw new Error("<Team>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFavorite() {
    		throw new Error("<Team>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFavorite(value) {
    		throw new Error("<Team>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeGolferCounts() {
    		throw new Error("<Team>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeGolferCounts(value) {
    		throw new Error("<Team>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn) {
      var module = { exports: {} };
    	return fn(module, module.exports), module.exports;
    }

    function commonjsRequire (target) {
    	throw new Error('Could not dynamically require "' + target + '". Please configure the dynamicRequireTargets option of @rollup/plugin-commonjs appropriately for this require call to behave properly.');
    }

    var moment = createCommonjsModule(function (module, exports) {
    (function (global, factory) {
        module.exports = factory() ;
    }(commonjsGlobal, (function () {
        var hookCallback;

        function hooks() {
            return hookCallback.apply(null, arguments);
        }

        // This is done to register the method called with moment()
        // without creating circular dependencies.
        function setHookCallback(callback) {
            hookCallback = callback;
        }

        function isArray(input) {
            return (
                input instanceof Array ||
                Object.prototype.toString.call(input) === '[object Array]'
            );
        }

        function isObject(input) {
            // IE8 will treat undefined and null as object if it wasn't for
            // input != null
            return (
                input != null &&
                Object.prototype.toString.call(input) === '[object Object]'
            );
        }

        function hasOwnProp(a, b) {
            return Object.prototype.hasOwnProperty.call(a, b);
        }

        function isObjectEmpty(obj) {
            if (Object.getOwnPropertyNames) {
                return Object.getOwnPropertyNames(obj).length === 0;
            } else {
                var k;
                for (k in obj) {
                    if (hasOwnProp(obj, k)) {
                        return false;
                    }
                }
                return true;
            }
        }

        function isUndefined(input) {
            return input === void 0;
        }

        function isNumber(input) {
            return (
                typeof input === 'number' ||
                Object.prototype.toString.call(input) === '[object Number]'
            );
        }

        function isDate(input) {
            return (
                input instanceof Date ||
                Object.prototype.toString.call(input) === '[object Date]'
            );
        }

        function map(arr, fn) {
            var res = [],
                i,
                arrLen = arr.length;
            for (i = 0; i < arrLen; ++i) {
                res.push(fn(arr[i], i));
            }
            return res;
        }

        function extend(a, b) {
            for (var i in b) {
                if (hasOwnProp(b, i)) {
                    a[i] = b[i];
                }
            }

            if (hasOwnProp(b, 'toString')) {
                a.toString = b.toString;
            }

            if (hasOwnProp(b, 'valueOf')) {
                a.valueOf = b.valueOf;
            }

            return a;
        }

        function createUTC(input, format, locale, strict) {
            return createLocalOrUTC(input, format, locale, strict, true).utc();
        }

        function defaultParsingFlags() {
            // We need to deep clone this object.
            return {
                empty: false,
                unusedTokens: [],
                unusedInput: [],
                overflow: -2,
                charsLeftOver: 0,
                nullInput: false,
                invalidEra: null,
                invalidMonth: null,
                invalidFormat: false,
                userInvalidated: false,
                iso: false,
                parsedDateParts: [],
                era: null,
                meridiem: null,
                rfc2822: false,
                weekdayMismatch: false,
            };
        }

        function getParsingFlags(m) {
            if (m._pf == null) {
                m._pf = defaultParsingFlags();
            }
            return m._pf;
        }

        var some;
        if (Array.prototype.some) {
            some = Array.prototype.some;
        } else {
            some = function (fun) {
                var t = Object(this),
                    len = t.length >>> 0,
                    i;

                for (i = 0; i < len; i++) {
                    if (i in t && fun.call(this, t[i], i, t)) {
                        return true;
                    }
                }

                return false;
            };
        }

        function isValid(m) {
            if (m._isValid == null) {
                var flags = getParsingFlags(m),
                    parsedParts = some.call(flags.parsedDateParts, function (i) {
                        return i != null;
                    }),
                    isNowValid =
                        !isNaN(m._d.getTime()) &&
                        flags.overflow < 0 &&
                        !flags.empty &&
                        !flags.invalidEra &&
                        !flags.invalidMonth &&
                        !flags.invalidWeekday &&
                        !flags.weekdayMismatch &&
                        !flags.nullInput &&
                        !flags.invalidFormat &&
                        !flags.userInvalidated &&
                        (!flags.meridiem || (flags.meridiem && parsedParts));

                if (m._strict) {
                    isNowValid =
                        isNowValid &&
                        flags.charsLeftOver === 0 &&
                        flags.unusedTokens.length === 0 &&
                        flags.bigHour === undefined;
                }

                if (Object.isFrozen == null || !Object.isFrozen(m)) {
                    m._isValid = isNowValid;
                } else {
                    return isNowValid;
                }
            }
            return m._isValid;
        }

        function createInvalid(flags) {
            var m = createUTC(NaN);
            if (flags != null) {
                extend(getParsingFlags(m), flags);
            } else {
                getParsingFlags(m).userInvalidated = true;
            }

            return m;
        }

        // Plugins that add properties should also add the key here (null value),
        // so we can properly clone ourselves.
        var momentProperties = (hooks.momentProperties = []),
            updateInProgress = false;

        function copyConfig(to, from) {
            var i,
                prop,
                val,
                momentPropertiesLen = momentProperties.length;

            if (!isUndefined(from._isAMomentObject)) {
                to._isAMomentObject = from._isAMomentObject;
            }
            if (!isUndefined(from._i)) {
                to._i = from._i;
            }
            if (!isUndefined(from._f)) {
                to._f = from._f;
            }
            if (!isUndefined(from._l)) {
                to._l = from._l;
            }
            if (!isUndefined(from._strict)) {
                to._strict = from._strict;
            }
            if (!isUndefined(from._tzm)) {
                to._tzm = from._tzm;
            }
            if (!isUndefined(from._isUTC)) {
                to._isUTC = from._isUTC;
            }
            if (!isUndefined(from._offset)) {
                to._offset = from._offset;
            }
            if (!isUndefined(from._pf)) {
                to._pf = getParsingFlags(from);
            }
            if (!isUndefined(from._locale)) {
                to._locale = from._locale;
            }

            if (momentPropertiesLen > 0) {
                for (i = 0; i < momentPropertiesLen; i++) {
                    prop = momentProperties[i];
                    val = from[prop];
                    if (!isUndefined(val)) {
                        to[prop] = val;
                    }
                }
            }

            return to;
        }

        // Moment prototype object
        function Moment(config) {
            copyConfig(this, config);
            this._d = new Date(config._d != null ? config._d.getTime() : NaN);
            if (!this.isValid()) {
                this._d = new Date(NaN);
            }
            // Prevent infinite loop in case updateOffset creates new moment
            // objects.
            if (updateInProgress === false) {
                updateInProgress = true;
                hooks.updateOffset(this);
                updateInProgress = false;
            }
        }

        function isMoment(obj) {
            return (
                obj instanceof Moment || (obj != null && obj._isAMomentObject != null)
            );
        }

        function warn(msg) {
            if (
                hooks.suppressDeprecationWarnings === false &&
                typeof console !== 'undefined' &&
                console.warn
            ) {
                console.warn('Deprecation warning: ' + msg);
            }
        }

        function deprecate(msg, fn) {
            var firstTime = true;

            return extend(function () {
                if (hooks.deprecationHandler != null) {
                    hooks.deprecationHandler(null, msg);
                }
                if (firstTime) {
                    var args = [],
                        arg,
                        i,
                        key,
                        argLen = arguments.length;
                    for (i = 0; i < argLen; i++) {
                        arg = '';
                        if (typeof arguments[i] === 'object') {
                            arg += '\n[' + i + '] ';
                            for (key in arguments[0]) {
                                if (hasOwnProp(arguments[0], key)) {
                                    arg += key + ': ' + arguments[0][key] + ', ';
                                }
                            }
                            arg = arg.slice(0, -2); // Remove trailing comma and space
                        } else {
                            arg = arguments[i];
                        }
                        args.push(arg);
                    }
                    warn(
                        msg +
                            '\nArguments: ' +
                            Array.prototype.slice.call(args).join('') +
                            '\n' +
                            new Error().stack
                    );
                    firstTime = false;
                }
                return fn.apply(this, arguments);
            }, fn);
        }

        var deprecations = {};

        function deprecateSimple(name, msg) {
            if (hooks.deprecationHandler != null) {
                hooks.deprecationHandler(name, msg);
            }
            if (!deprecations[name]) {
                warn(msg);
                deprecations[name] = true;
            }
        }

        hooks.suppressDeprecationWarnings = false;
        hooks.deprecationHandler = null;

        function isFunction(input) {
            return (
                (typeof Function !== 'undefined' && input instanceof Function) ||
                Object.prototype.toString.call(input) === '[object Function]'
            );
        }

        function set(config) {
            var prop, i;
            for (i in config) {
                if (hasOwnProp(config, i)) {
                    prop = config[i];
                    if (isFunction(prop)) {
                        this[i] = prop;
                    } else {
                        this['_' + i] = prop;
                    }
                }
            }
            this._config = config;
            // Lenient ordinal parsing accepts just a number in addition to
            // number + (possibly) stuff coming from _dayOfMonthOrdinalParse.
            // TODO: Remove "ordinalParse" fallback in next major release.
            this._dayOfMonthOrdinalParseLenient = new RegExp(
                (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) +
                    '|' +
                    /\d{1,2}/.source
            );
        }

        function mergeConfigs(parentConfig, childConfig) {
            var res = extend({}, parentConfig),
                prop;
            for (prop in childConfig) {
                if (hasOwnProp(childConfig, prop)) {
                    if (isObject(parentConfig[prop]) && isObject(childConfig[prop])) {
                        res[prop] = {};
                        extend(res[prop], parentConfig[prop]);
                        extend(res[prop], childConfig[prop]);
                    } else if (childConfig[prop] != null) {
                        res[prop] = childConfig[prop];
                    } else {
                        delete res[prop];
                    }
                }
            }
            for (prop in parentConfig) {
                if (
                    hasOwnProp(parentConfig, prop) &&
                    !hasOwnProp(childConfig, prop) &&
                    isObject(parentConfig[prop])
                ) {
                    // make sure changes to properties don't modify parent config
                    res[prop] = extend({}, res[prop]);
                }
            }
            return res;
        }

        function Locale(config) {
            if (config != null) {
                this.set(config);
            }
        }

        var keys;

        if (Object.keys) {
            keys = Object.keys;
        } else {
            keys = function (obj) {
                var i,
                    res = [];
                for (i in obj) {
                    if (hasOwnProp(obj, i)) {
                        res.push(i);
                    }
                }
                return res;
            };
        }

        var defaultCalendar = {
            sameDay: '[Today at] LT',
            nextDay: '[Tomorrow at] LT',
            nextWeek: 'dddd [at] LT',
            lastDay: '[Yesterday at] LT',
            lastWeek: '[Last] dddd [at] LT',
            sameElse: 'L',
        };

        function calendar(key, mom, now) {
            var output = this._calendar[key] || this._calendar['sameElse'];
            return isFunction(output) ? output.call(mom, now) : output;
        }

        function zeroFill(number, targetLength, forceSign) {
            var absNumber = '' + Math.abs(number),
                zerosToFill = targetLength - absNumber.length,
                sign = number >= 0;
            return (
                (sign ? (forceSign ? '+' : '') : '-') +
                Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) +
                absNumber
            );
        }

        var formattingTokens =
                /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|N{1,5}|YYYYYY|YYYYY|YYYY|YY|y{2,4}|yo?|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g,
            localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g,
            formatFunctions = {},
            formatTokenFunctions = {};

        // token:    'M'
        // padded:   ['MM', 2]
        // ordinal:  'Mo'
        // callback: function () { this.month() + 1 }
        function addFormatToken(token, padded, ordinal, callback) {
            var func = callback;
            if (typeof callback === 'string') {
                func = function () {
                    return this[callback]();
                };
            }
            if (token) {
                formatTokenFunctions[token] = func;
            }
            if (padded) {
                formatTokenFunctions[padded[0]] = function () {
                    return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
                };
            }
            if (ordinal) {
                formatTokenFunctions[ordinal] = function () {
                    return this.localeData().ordinal(
                        func.apply(this, arguments),
                        token
                    );
                };
            }
        }

        function removeFormattingTokens(input) {
            if (input.match(/\[[\s\S]/)) {
                return input.replace(/^\[|\]$/g, '');
            }
            return input.replace(/\\/g, '');
        }

        function makeFormatFunction(format) {
            var array = format.match(formattingTokens),
                i,
                length;

            for (i = 0, length = array.length; i < length; i++) {
                if (formatTokenFunctions[array[i]]) {
                    array[i] = formatTokenFunctions[array[i]];
                } else {
                    array[i] = removeFormattingTokens(array[i]);
                }
            }

            return function (mom) {
                var output = '',
                    i;
                for (i = 0; i < length; i++) {
                    output += isFunction(array[i])
                        ? array[i].call(mom, format)
                        : array[i];
                }
                return output;
            };
        }

        // format date using native date object
        function formatMoment(m, format) {
            if (!m.isValid()) {
                return m.localeData().invalidDate();
            }

            format = expandFormat(format, m.localeData());
            formatFunctions[format] =
                formatFunctions[format] || makeFormatFunction(format);

            return formatFunctions[format](m);
        }

        function expandFormat(format, locale) {
            var i = 5;

            function replaceLongDateFormatTokens(input) {
                return locale.longDateFormat(input) || input;
            }

            localFormattingTokens.lastIndex = 0;
            while (i >= 0 && localFormattingTokens.test(format)) {
                format = format.replace(
                    localFormattingTokens,
                    replaceLongDateFormatTokens
                );
                localFormattingTokens.lastIndex = 0;
                i -= 1;
            }

            return format;
        }

        var defaultLongDateFormat = {
            LTS: 'h:mm:ss A',
            LT: 'h:mm A',
            L: 'MM/DD/YYYY',
            LL: 'MMMM D, YYYY',
            LLL: 'MMMM D, YYYY h:mm A',
            LLLL: 'dddd, MMMM D, YYYY h:mm A',
        };

        function longDateFormat(key) {
            var format = this._longDateFormat[key],
                formatUpper = this._longDateFormat[key.toUpperCase()];

            if (format || !formatUpper) {
                return format;
            }

            this._longDateFormat[key] = formatUpper
                .match(formattingTokens)
                .map(function (tok) {
                    if (
                        tok === 'MMMM' ||
                        tok === 'MM' ||
                        tok === 'DD' ||
                        tok === 'dddd'
                    ) {
                        return tok.slice(1);
                    }
                    return tok;
                })
                .join('');

            return this._longDateFormat[key];
        }

        var defaultInvalidDate = 'Invalid date';

        function invalidDate() {
            return this._invalidDate;
        }

        var defaultOrdinal = '%d',
            defaultDayOfMonthOrdinalParse = /\d{1,2}/;

        function ordinal(number) {
            return this._ordinal.replace('%d', number);
        }

        var defaultRelativeTime = {
            future: 'in %s',
            past: '%s ago',
            s: 'a few seconds',
            ss: '%d seconds',
            m: 'a minute',
            mm: '%d minutes',
            h: 'an hour',
            hh: '%d hours',
            d: 'a day',
            dd: '%d days',
            w: 'a week',
            ww: '%d weeks',
            M: 'a month',
            MM: '%d months',
            y: 'a year',
            yy: '%d years',
        };

        function relativeTime(number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return isFunction(output)
                ? output(number, withoutSuffix, string, isFuture)
                : output.replace(/%d/i, number);
        }

        function pastFuture(diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return isFunction(format) ? format(output) : format.replace(/%s/i, output);
        }

        var aliases = {};

        function addUnitAlias(unit, shorthand) {
            var lowerCase = unit.toLowerCase();
            aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
        }

        function normalizeUnits(units) {
            return typeof units === 'string'
                ? aliases[units] || aliases[units.toLowerCase()]
                : undefined;
        }

        function normalizeObjectUnits(inputObject) {
            var normalizedInput = {},
                normalizedProp,
                prop;

            for (prop in inputObject) {
                if (hasOwnProp(inputObject, prop)) {
                    normalizedProp = normalizeUnits(prop);
                    if (normalizedProp) {
                        normalizedInput[normalizedProp] = inputObject[prop];
                    }
                }
            }

            return normalizedInput;
        }

        var priorities = {};

        function addUnitPriority(unit, priority) {
            priorities[unit] = priority;
        }

        function getPrioritizedUnits(unitsObj) {
            var units = [],
                u;
            for (u in unitsObj) {
                if (hasOwnProp(unitsObj, u)) {
                    units.push({ unit: u, priority: priorities[u] });
                }
            }
            units.sort(function (a, b) {
                return a.priority - b.priority;
            });
            return units;
        }

        function isLeapYear(year) {
            return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        }

        function absFloor(number) {
            if (number < 0) {
                // -0 -> 0
                return Math.ceil(number) || 0;
            } else {
                return Math.floor(number);
            }
        }

        function toInt(argumentForCoercion) {
            var coercedNumber = +argumentForCoercion,
                value = 0;

            if (coercedNumber !== 0 && isFinite(coercedNumber)) {
                value = absFloor(coercedNumber);
            }

            return value;
        }

        function makeGetSet(unit, keepTime) {
            return function (value) {
                if (value != null) {
                    set$1(this, unit, value);
                    hooks.updateOffset(this, keepTime);
                    return this;
                } else {
                    return get(this, unit);
                }
            };
        }

        function get(mom, unit) {
            return mom.isValid()
                ? mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]()
                : NaN;
        }

        function set$1(mom, unit, value) {
            if (mom.isValid() && !isNaN(value)) {
                if (
                    unit === 'FullYear' &&
                    isLeapYear(mom.year()) &&
                    mom.month() === 1 &&
                    mom.date() === 29
                ) {
                    value = toInt(value);
                    mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](
                        value,
                        mom.month(),
                        daysInMonth(value, mom.month())
                    );
                } else {
                    mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
                }
            }
        }

        // MOMENTS

        function stringGet(units) {
            units = normalizeUnits(units);
            if (isFunction(this[units])) {
                return this[units]();
            }
            return this;
        }

        function stringSet(units, value) {
            if (typeof units === 'object') {
                units = normalizeObjectUnits(units);
                var prioritized = getPrioritizedUnits(units),
                    i,
                    prioritizedLen = prioritized.length;
                for (i = 0; i < prioritizedLen; i++) {
                    this[prioritized[i].unit](units[prioritized[i].unit]);
                }
            } else {
                units = normalizeUnits(units);
                if (isFunction(this[units])) {
                    return this[units](value);
                }
            }
            return this;
        }

        var match1 = /\d/, //       0 - 9
            match2 = /\d\d/, //      00 - 99
            match3 = /\d{3}/, //     000 - 999
            match4 = /\d{4}/, //    0000 - 9999
            match6 = /[+-]?\d{6}/, // -999999 - 999999
            match1to2 = /\d\d?/, //       0 - 99
            match3to4 = /\d\d\d\d?/, //     999 - 9999
            match5to6 = /\d\d\d\d\d\d?/, //   99999 - 999999
            match1to3 = /\d{1,3}/, //       0 - 999
            match1to4 = /\d{1,4}/, //       0 - 9999
            match1to6 = /[+-]?\d{1,6}/, // -999999 - 999999
            matchUnsigned = /\d+/, //       0 - inf
            matchSigned = /[+-]?\d+/, //    -inf - inf
            matchOffset = /Z|[+-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
            matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi, // +00 -00 +00:00 -00:00 +0000 -0000 or Z
            matchTimestamp = /[+-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123
            // any word (or two) characters or numbers including two/three word month in arabic.
            // includes scottish gaelic two word and hyphenated months
            matchWord =
                /[0-9]{0,256}['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFF07\uFF10-\uFFEF]{1,256}|[\u0600-\u06FF\/]{1,256}(\s*?[\u0600-\u06FF]{1,256}){1,2}/i,
            regexes;

        regexes = {};

        function addRegexToken(token, regex, strictRegex) {
            regexes[token] = isFunction(regex)
                ? regex
                : function (isStrict, localeData) {
                      return isStrict && strictRegex ? strictRegex : regex;
                  };
        }

        function getParseRegexForToken(token, config) {
            if (!hasOwnProp(regexes, token)) {
                return new RegExp(unescapeFormat(token));
            }

            return regexes[token](config._strict, config._locale);
        }

        // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
        function unescapeFormat(s) {
            return regexEscape(
                s
                    .replace('\\', '')
                    .replace(
                        /\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g,
                        function (matched, p1, p2, p3, p4) {
                            return p1 || p2 || p3 || p4;
                        }
                    )
            );
        }

        function regexEscape(s) {
            return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        }

        var tokens = {};

        function addParseToken(token, callback) {
            var i,
                func = callback,
                tokenLen;
            if (typeof token === 'string') {
                token = [token];
            }
            if (isNumber(callback)) {
                func = function (input, array) {
                    array[callback] = toInt(input);
                };
            }
            tokenLen = token.length;
            for (i = 0; i < tokenLen; i++) {
                tokens[token[i]] = func;
            }
        }

        function addWeekParseToken(token, callback) {
            addParseToken(token, function (input, array, config, token) {
                config._w = config._w || {};
                callback(input, config._w, config, token);
            });
        }

        function addTimeToArrayFromToken(token, input, config) {
            if (input != null && hasOwnProp(tokens, token)) {
                tokens[token](input, config._a, config, token);
            }
        }

        var YEAR = 0,
            MONTH = 1,
            DATE = 2,
            HOUR = 3,
            MINUTE = 4,
            SECOND = 5,
            MILLISECOND = 6,
            WEEK = 7,
            WEEKDAY = 8;

        function mod(n, x) {
            return ((n % x) + x) % x;
        }

        var indexOf;

        if (Array.prototype.indexOf) {
            indexOf = Array.prototype.indexOf;
        } else {
            indexOf = function (o) {
                // I know
                var i;
                for (i = 0; i < this.length; ++i) {
                    if (this[i] === o) {
                        return i;
                    }
                }
                return -1;
            };
        }

        function daysInMonth(year, month) {
            if (isNaN(year) || isNaN(month)) {
                return NaN;
            }
            var modMonth = mod(month, 12);
            year += (month - modMonth) / 12;
            return modMonth === 1
                ? isLeapYear(year)
                    ? 29
                    : 28
                : 31 - ((modMonth % 7) % 2);
        }

        // FORMATTING

        addFormatToken('M', ['MM', 2], 'Mo', function () {
            return this.month() + 1;
        });

        addFormatToken('MMM', 0, 0, function (format) {
            return this.localeData().monthsShort(this, format);
        });

        addFormatToken('MMMM', 0, 0, function (format) {
            return this.localeData().months(this, format);
        });

        // ALIASES

        addUnitAlias('month', 'M');

        // PRIORITY

        addUnitPriority('month', 8);

        // PARSING

        addRegexToken('M', match1to2);
        addRegexToken('MM', match1to2, match2);
        addRegexToken('MMM', function (isStrict, locale) {
            return locale.monthsShortRegex(isStrict);
        });
        addRegexToken('MMMM', function (isStrict, locale) {
            return locale.monthsRegex(isStrict);
        });

        addParseToken(['M', 'MM'], function (input, array) {
            array[MONTH] = toInt(input) - 1;
        });

        addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
            var month = config._locale.monthsParse(input, token, config._strict);
            // if we didn't find a month name, mark the date as invalid.
            if (month != null) {
                array[MONTH] = month;
            } else {
                getParsingFlags(config).invalidMonth = input;
            }
        });

        // LOCALES

        var defaultLocaleMonths =
                'January_February_March_April_May_June_July_August_September_October_November_December'.split(
                    '_'
                ),
            defaultLocaleMonthsShort =
                'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_'),
            MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/,
            defaultMonthsShortRegex = matchWord,
            defaultMonthsRegex = matchWord;

        function localeMonths(m, format) {
            if (!m) {
                return isArray(this._months)
                    ? this._months
                    : this._months['standalone'];
            }
            return isArray(this._months)
                ? this._months[m.month()]
                : this._months[
                      (this._months.isFormat || MONTHS_IN_FORMAT).test(format)
                          ? 'format'
                          : 'standalone'
                  ][m.month()];
        }

        function localeMonthsShort(m, format) {
            if (!m) {
                return isArray(this._monthsShort)
                    ? this._monthsShort
                    : this._monthsShort['standalone'];
            }
            return isArray(this._monthsShort)
                ? this._monthsShort[m.month()]
                : this._monthsShort[
                      MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'
                  ][m.month()];
        }

        function handleStrictParse(monthName, format, strict) {
            var i,
                ii,
                mom,
                llc = monthName.toLocaleLowerCase();
            if (!this._monthsParse) {
                // this is not used
                this._monthsParse = [];
                this._longMonthsParse = [];
                this._shortMonthsParse = [];
                for (i = 0; i < 12; ++i) {
                    mom = createUTC([2000, i]);
                    this._shortMonthsParse[i] = this.monthsShort(
                        mom,
                        ''
                    ).toLocaleLowerCase();
                    this._longMonthsParse[i] = this.months(mom, '').toLocaleLowerCase();
                }
            }

            if (strict) {
                if (format === 'MMM') {
                    ii = indexOf.call(this._shortMonthsParse, llc);
                    return ii !== -1 ? ii : null;
                } else {
                    ii = indexOf.call(this._longMonthsParse, llc);
                    return ii !== -1 ? ii : null;
                }
            } else {
                if (format === 'MMM') {
                    ii = indexOf.call(this._shortMonthsParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._longMonthsParse, llc);
                    return ii !== -1 ? ii : null;
                } else {
                    ii = indexOf.call(this._longMonthsParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._shortMonthsParse, llc);
                    return ii !== -1 ? ii : null;
                }
            }
        }

        function localeMonthsParse(monthName, format, strict) {
            var i, mom, regex;

            if (this._monthsParseExact) {
                return handleStrictParse.call(this, monthName, format, strict);
            }

            if (!this._monthsParse) {
                this._monthsParse = [];
                this._longMonthsParse = [];
                this._shortMonthsParse = [];
            }

            // TODO: add sorting
            // Sorting makes sure if one month (or abbr) is a prefix of another
            // see sorting in computeMonthsParse
            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                mom = createUTC([2000, i]);
                if (strict && !this._longMonthsParse[i]) {
                    this._longMonthsParse[i] = new RegExp(
                        '^' + this.months(mom, '').replace('.', '') + '$',
                        'i'
                    );
                    this._shortMonthsParse[i] = new RegExp(
                        '^' + this.monthsShort(mom, '').replace('.', '') + '$',
                        'i'
                    );
                }
                if (!strict && !this._monthsParse[i]) {
                    regex =
                        '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (
                    strict &&
                    format === 'MMMM' &&
                    this._longMonthsParse[i].test(monthName)
                ) {
                    return i;
                } else if (
                    strict &&
                    format === 'MMM' &&
                    this._shortMonthsParse[i].test(monthName)
                ) {
                    return i;
                } else if (!strict && this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        }

        // MOMENTS

        function setMonth(mom, value) {
            var dayOfMonth;

            if (!mom.isValid()) {
                // No op
                return mom;
            }

            if (typeof value === 'string') {
                if (/^\d+$/.test(value)) {
                    value = toInt(value);
                } else {
                    value = mom.localeData().monthsParse(value);
                    // TODO: Another silent failure?
                    if (!isNumber(value)) {
                        return mom;
                    }
                }
            }

            dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
            mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
            return mom;
        }

        function getSetMonth(value) {
            if (value != null) {
                setMonth(this, value);
                hooks.updateOffset(this, true);
                return this;
            } else {
                return get(this, 'Month');
            }
        }

        function getDaysInMonth() {
            return daysInMonth(this.year(), this.month());
        }

        function monthsShortRegex(isStrict) {
            if (this._monthsParseExact) {
                if (!hasOwnProp(this, '_monthsRegex')) {
                    computeMonthsParse.call(this);
                }
                if (isStrict) {
                    return this._monthsShortStrictRegex;
                } else {
                    return this._monthsShortRegex;
                }
            } else {
                if (!hasOwnProp(this, '_monthsShortRegex')) {
                    this._monthsShortRegex = defaultMonthsShortRegex;
                }
                return this._monthsShortStrictRegex && isStrict
                    ? this._monthsShortStrictRegex
                    : this._monthsShortRegex;
            }
        }

        function monthsRegex(isStrict) {
            if (this._monthsParseExact) {
                if (!hasOwnProp(this, '_monthsRegex')) {
                    computeMonthsParse.call(this);
                }
                if (isStrict) {
                    return this._monthsStrictRegex;
                } else {
                    return this._monthsRegex;
                }
            } else {
                if (!hasOwnProp(this, '_monthsRegex')) {
                    this._monthsRegex = defaultMonthsRegex;
                }
                return this._monthsStrictRegex && isStrict
                    ? this._monthsStrictRegex
                    : this._monthsRegex;
            }
        }

        function computeMonthsParse() {
            function cmpLenRev(a, b) {
                return b.length - a.length;
            }

            var shortPieces = [],
                longPieces = [],
                mixedPieces = [],
                i,
                mom;
            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                mom = createUTC([2000, i]);
                shortPieces.push(this.monthsShort(mom, ''));
                longPieces.push(this.months(mom, ''));
                mixedPieces.push(this.months(mom, ''));
                mixedPieces.push(this.monthsShort(mom, ''));
            }
            // Sorting makes sure if one month (or abbr) is a prefix of another it
            // will match the longer piece.
            shortPieces.sort(cmpLenRev);
            longPieces.sort(cmpLenRev);
            mixedPieces.sort(cmpLenRev);
            for (i = 0; i < 12; i++) {
                shortPieces[i] = regexEscape(shortPieces[i]);
                longPieces[i] = regexEscape(longPieces[i]);
            }
            for (i = 0; i < 24; i++) {
                mixedPieces[i] = regexEscape(mixedPieces[i]);
            }

            this._monthsRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
            this._monthsShortRegex = this._monthsRegex;
            this._monthsStrictRegex = new RegExp(
                '^(' + longPieces.join('|') + ')',
                'i'
            );
            this._monthsShortStrictRegex = new RegExp(
                '^(' + shortPieces.join('|') + ')',
                'i'
            );
        }

        // FORMATTING

        addFormatToken('Y', 0, 0, function () {
            var y = this.year();
            return y <= 9999 ? zeroFill(y, 4) : '+' + y;
        });

        addFormatToken(0, ['YY', 2], 0, function () {
            return this.year() % 100;
        });

        addFormatToken(0, ['YYYY', 4], 0, 'year');
        addFormatToken(0, ['YYYYY', 5], 0, 'year');
        addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

        // ALIASES

        addUnitAlias('year', 'y');

        // PRIORITIES

        addUnitPriority('year', 1);

        // PARSING

        addRegexToken('Y', matchSigned);
        addRegexToken('YY', match1to2, match2);
        addRegexToken('YYYY', match1to4, match4);
        addRegexToken('YYYYY', match1to6, match6);
        addRegexToken('YYYYYY', match1to6, match6);

        addParseToken(['YYYYY', 'YYYYYY'], YEAR);
        addParseToken('YYYY', function (input, array) {
            array[YEAR] =
                input.length === 2 ? hooks.parseTwoDigitYear(input) : toInt(input);
        });
        addParseToken('YY', function (input, array) {
            array[YEAR] = hooks.parseTwoDigitYear(input);
        });
        addParseToken('Y', function (input, array) {
            array[YEAR] = parseInt(input, 10);
        });

        // HELPERS

        function daysInYear(year) {
            return isLeapYear(year) ? 366 : 365;
        }

        // HOOKS

        hooks.parseTwoDigitYear = function (input) {
            return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
        };

        // MOMENTS

        var getSetYear = makeGetSet('FullYear', true);

        function getIsLeapYear() {
            return isLeapYear(this.year());
        }

        function createDate(y, m, d, h, M, s, ms) {
            // can't just apply() to create a date:
            // https://stackoverflow.com/q/181348
            var date;
            // the date constructor remaps years 0-99 to 1900-1999
            if (y < 100 && y >= 0) {
                // preserve leap years using a full 400 year cycle, then reset
                date = new Date(y + 400, m, d, h, M, s, ms);
                if (isFinite(date.getFullYear())) {
                    date.setFullYear(y);
                }
            } else {
                date = new Date(y, m, d, h, M, s, ms);
            }

            return date;
        }

        function createUTCDate(y) {
            var date, args;
            // the Date.UTC function remaps years 0-99 to 1900-1999
            if (y < 100 && y >= 0) {
                args = Array.prototype.slice.call(arguments);
                // preserve leap years using a full 400 year cycle, then reset
                args[0] = y + 400;
                date = new Date(Date.UTC.apply(null, args));
                if (isFinite(date.getUTCFullYear())) {
                    date.setUTCFullYear(y);
                }
            } else {
                date = new Date(Date.UTC.apply(null, arguments));
            }

            return date;
        }

        // start-of-first-week - start-of-year
        function firstWeekOffset(year, dow, doy) {
            var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
                fwd = 7 + dow - doy,
                // first-week day local weekday -- which local weekday is fwd
                fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

            return -fwdlw + fwd - 1;
        }

        // https://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
        function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
            var localWeekday = (7 + weekday - dow) % 7,
                weekOffset = firstWeekOffset(year, dow, doy),
                dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
                resYear,
                resDayOfYear;

            if (dayOfYear <= 0) {
                resYear = year - 1;
                resDayOfYear = daysInYear(resYear) + dayOfYear;
            } else if (dayOfYear > daysInYear(year)) {
                resYear = year + 1;
                resDayOfYear = dayOfYear - daysInYear(year);
            } else {
                resYear = year;
                resDayOfYear = dayOfYear;
            }

            return {
                year: resYear,
                dayOfYear: resDayOfYear,
            };
        }

        function weekOfYear(mom, dow, doy) {
            var weekOffset = firstWeekOffset(mom.year(), dow, doy),
                week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
                resWeek,
                resYear;

            if (week < 1) {
                resYear = mom.year() - 1;
                resWeek = week + weeksInYear(resYear, dow, doy);
            } else if (week > weeksInYear(mom.year(), dow, doy)) {
                resWeek = week - weeksInYear(mom.year(), dow, doy);
                resYear = mom.year() + 1;
            } else {
                resYear = mom.year();
                resWeek = week;
            }

            return {
                week: resWeek,
                year: resYear,
            };
        }

        function weeksInYear(year, dow, doy) {
            var weekOffset = firstWeekOffset(year, dow, doy),
                weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
            return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
        }

        // FORMATTING

        addFormatToken('w', ['ww', 2], 'wo', 'week');
        addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

        // ALIASES

        addUnitAlias('week', 'w');
        addUnitAlias('isoWeek', 'W');

        // PRIORITIES

        addUnitPriority('week', 5);
        addUnitPriority('isoWeek', 5);

        // PARSING

        addRegexToken('w', match1to2);
        addRegexToken('ww', match1to2, match2);
        addRegexToken('W', match1to2);
        addRegexToken('WW', match1to2, match2);

        addWeekParseToken(
            ['w', 'ww', 'W', 'WW'],
            function (input, week, config, token) {
                week[token.substr(0, 1)] = toInt(input);
            }
        );

        // HELPERS

        // LOCALES

        function localeWeek(mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        }

        var defaultLocaleWeek = {
            dow: 0, // Sunday is the first day of the week.
            doy: 6, // The week that contains Jan 6th is the first week of the year.
        };

        function localeFirstDayOfWeek() {
            return this._week.dow;
        }

        function localeFirstDayOfYear() {
            return this._week.doy;
        }

        // MOMENTS

        function getSetWeek(input) {
            var week = this.localeData().week(this);
            return input == null ? week : this.add((input - week) * 7, 'd');
        }

        function getSetISOWeek(input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add((input - week) * 7, 'd');
        }

        // FORMATTING

        addFormatToken('d', 0, 'do', 'day');

        addFormatToken('dd', 0, 0, function (format) {
            return this.localeData().weekdaysMin(this, format);
        });

        addFormatToken('ddd', 0, 0, function (format) {
            return this.localeData().weekdaysShort(this, format);
        });

        addFormatToken('dddd', 0, 0, function (format) {
            return this.localeData().weekdays(this, format);
        });

        addFormatToken('e', 0, 0, 'weekday');
        addFormatToken('E', 0, 0, 'isoWeekday');

        // ALIASES

        addUnitAlias('day', 'd');
        addUnitAlias('weekday', 'e');
        addUnitAlias('isoWeekday', 'E');

        // PRIORITY
        addUnitPriority('day', 11);
        addUnitPriority('weekday', 11);
        addUnitPriority('isoWeekday', 11);

        // PARSING

        addRegexToken('d', match1to2);
        addRegexToken('e', match1to2);
        addRegexToken('E', match1to2);
        addRegexToken('dd', function (isStrict, locale) {
            return locale.weekdaysMinRegex(isStrict);
        });
        addRegexToken('ddd', function (isStrict, locale) {
            return locale.weekdaysShortRegex(isStrict);
        });
        addRegexToken('dddd', function (isStrict, locale) {
            return locale.weekdaysRegex(isStrict);
        });

        addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
            var weekday = config._locale.weekdaysParse(input, token, config._strict);
            // if we didn't get a weekday name, mark the date as invalid
            if (weekday != null) {
                week.d = weekday;
            } else {
                getParsingFlags(config).invalidWeekday = input;
            }
        });

        addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
            week[token] = toInt(input);
        });

        // HELPERS

        function parseWeekday(input, locale) {
            if (typeof input !== 'string') {
                return input;
            }

            if (!isNaN(input)) {
                return parseInt(input, 10);
            }

            input = locale.weekdaysParse(input);
            if (typeof input === 'number') {
                return input;
            }

            return null;
        }

        function parseIsoWeekday(input, locale) {
            if (typeof input === 'string') {
                return locale.weekdaysParse(input) % 7 || 7;
            }
            return isNaN(input) ? null : input;
        }

        // LOCALES
        function shiftWeekdays(ws, n) {
            return ws.slice(n, 7).concat(ws.slice(0, n));
        }

        var defaultLocaleWeekdays =
                'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
            defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_'),
            defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_'),
            defaultWeekdaysRegex = matchWord,
            defaultWeekdaysShortRegex = matchWord,
            defaultWeekdaysMinRegex = matchWord;

        function localeWeekdays(m, format) {
            var weekdays = isArray(this._weekdays)
                ? this._weekdays
                : this._weekdays[
                      m && m !== true && this._weekdays.isFormat.test(format)
                          ? 'format'
                          : 'standalone'
                  ];
            return m === true
                ? shiftWeekdays(weekdays, this._week.dow)
                : m
                ? weekdays[m.day()]
                : weekdays;
        }

        function localeWeekdaysShort(m) {
            return m === true
                ? shiftWeekdays(this._weekdaysShort, this._week.dow)
                : m
                ? this._weekdaysShort[m.day()]
                : this._weekdaysShort;
        }

        function localeWeekdaysMin(m) {
            return m === true
                ? shiftWeekdays(this._weekdaysMin, this._week.dow)
                : m
                ? this._weekdaysMin[m.day()]
                : this._weekdaysMin;
        }

        function handleStrictParse$1(weekdayName, format, strict) {
            var i,
                ii,
                mom,
                llc = weekdayName.toLocaleLowerCase();
            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
                this._shortWeekdaysParse = [];
                this._minWeekdaysParse = [];

                for (i = 0; i < 7; ++i) {
                    mom = createUTC([2000, 1]).day(i);
                    this._minWeekdaysParse[i] = this.weekdaysMin(
                        mom,
                        ''
                    ).toLocaleLowerCase();
                    this._shortWeekdaysParse[i] = this.weekdaysShort(
                        mom,
                        ''
                    ).toLocaleLowerCase();
                    this._weekdaysParse[i] = this.weekdays(mom, '').toLocaleLowerCase();
                }
            }

            if (strict) {
                if (format === 'dddd') {
                    ii = indexOf.call(this._weekdaysParse, llc);
                    return ii !== -1 ? ii : null;
                } else if (format === 'ddd') {
                    ii = indexOf.call(this._shortWeekdaysParse, llc);
                    return ii !== -1 ? ii : null;
                } else {
                    ii = indexOf.call(this._minWeekdaysParse, llc);
                    return ii !== -1 ? ii : null;
                }
            } else {
                if (format === 'dddd') {
                    ii = indexOf.call(this._weekdaysParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._shortWeekdaysParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._minWeekdaysParse, llc);
                    return ii !== -1 ? ii : null;
                } else if (format === 'ddd') {
                    ii = indexOf.call(this._shortWeekdaysParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._weekdaysParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._minWeekdaysParse, llc);
                    return ii !== -1 ? ii : null;
                } else {
                    ii = indexOf.call(this._minWeekdaysParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._weekdaysParse, llc);
                    if (ii !== -1) {
                        return ii;
                    }
                    ii = indexOf.call(this._shortWeekdaysParse, llc);
                    return ii !== -1 ? ii : null;
                }
            }
        }

        function localeWeekdaysParse(weekdayName, format, strict) {
            var i, mom, regex;

            if (this._weekdaysParseExact) {
                return handleStrictParse$1.call(this, weekdayName, format, strict);
            }

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
                this._minWeekdaysParse = [];
                this._shortWeekdaysParse = [];
                this._fullWeekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already

                mom = createUTC([2000, 1]).day(i);
                if (strict && !this._fullWeekdaysParse[i]) {
                    this._fullWeekdaysParse[i] = new RegExp(
                        '^' + this.weekdays(mom, '').replace('.', '\\.?') + '$',
                        'i'
                    );
                    this._shortWeekdaysParse[i] = new RegExp(
                        '^' + this.weekdaysShort(mom, '').replace('.', '\\.?') + '$',
                        'i'
                    );
                    this._minWeekdaysParse[i] = new RegExp(
                        '^' + this.weekdaysMin(mom, '').replace('.', '\\.?') + '$',
                        'i'
                    );
                }
                if (!this._weekdaysParse[i]) {
                    regex =
                        '^' +
                        this.weekdays(mom, '') +
                        '|^' +
                        this.weekdaysShort(mom, '') +
                        '|^' +
                        this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (
                    strict &&
                    format === 'dddd' &&
                    this._fullWeekdaysParse[i].test(weekdayName)
                ) {
                    return i;
                } else if (
                    strict &&
                    format === 'ddd' &&
                    this._shortWeekdaysParse[i].test(weekdayName)
                ) {
                    return i;
                } else if (
                    strict &&
                    format === 'dd' &&
                    this._minWeekdaysParse[i].test(weekdayName)
                ) {
                    return i;
                } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        }

        // MOMENTS

        function getSetDayOfWeek(input) {
            if (!this.isValid()) {
                return input != null ? this : NaN;
            }
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                input = parseWeekday(input, this.localeData());
                return this.add(input - day, 'd');
            } else {
                return day;
            }
        }

        function getSetLocaleDayOfWeek(input) {
            if (!this.isValid()) {
                return input != null ? this : NaN;
            }
            var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
            return input == null ? weekday : this.add(input - weekday, 'd');
        }

        function getSetISODayOfWeek(input) {
            if (!this.isValid()) {
                return input != null ? this : NaN;
            }

            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.

            if (input != null) {
                var weekday = parseIsoWeekday(input, this.localeData());
                return this.day(this.day() % 7 ? weekday : weekday - 7);
            } else {
                return this.day() || 7;
            }
        }

        function weekdaysRegex(isStrict) {
            if (this._weekdaysParseExact) {
                if (!hasOwnProp(this, '_weekdaysRegex')) {
                    computeWeekdaysParse.call(this);
                }
                if (isStrict) {
                    return this._weekdaysStrictRegex;
                } else {
                    return this._weekdaysRegex;
                }
            } else {
                if (!hasOwnProp(this, '_weekdaysRegex')) {
                    this._weekdaysRegex = defaultWeekdaysRegex;
                }
                return this._weekdaysStrictRegex && isStrict
                    ? this._weekdaysStrictRegex
                    : this._weekdaysRegex;
            }
        }

        function weekdaysShortRegex(isStrict) {
            if (this._weekdaysParseExact) {
                if (!hasOwnProp(this, '_weekdaysRegex')) {
                    computeWeekdaysParse.call(this);
                }
                if (isStrict) {
                    return this._weekdaysShortStrictRegex;
                } else {
                    return this._weekdaysShortRegex;
                }
            } else {
                if (!hasOwnProp(this, '_weekdaysShortRegex')) {
                    this._weekdaysShortRegex = defaultWeekdaysShortRegex;
                }
                return this._weekdaysShortStrictRegex && isStrict
                    ? this._weekdaysShortStrictRegex
                    : this._weekdaysShortRegex;
            }
        }

        function weekdaysMinRegex(isStrict) {
            if (this._weekdaysParseExact) {
                if (!hasOwnProp(this, '_weekdaysRegex')) {
                    computeWeekdaysParse.call(this);
                }
                if (isStrict) {
                    return this._weekdaysMinStrictRegex;
                } else {
                    return this._weekdaysMinRegex;
                }
            } else {
                if (!hasOwnProp(this, '_weekdaysMinRegex')) {
                    this._weekdaysMinRegex = defaultWeekdaysMinRegex;
                }
                return this._weekdaysMinStrictRegex && isStrict
                    ? this._weekdaysMinStrictRegex
                    : this._weekdaysMinRegex;
            }
        }

        function computeWeekdaysParse() {
            function cmpLenRev(a, b) {
                return b.length - a.length;
            }

            var minPieces = [],
                shortPieces = [],
                longPieces = [],
                mixedPieces = [],
                i,
                mom,
                minp,
                shortp,
                longp;
            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                mom = createUTC([2000, 1]).day(i);
                minp = regexEscape(this.weekdaysMin(mom, ''));
                shortp = regexEscape(this.weekdaysShort(mom, ''));
                longp = regexEscape(this.weekdays(mom, ''));
                minPieces.push(minp);
                shortPieces.push(shortp);
                longPieces.push(longp);
                mixedPieces.push(minp);
                mixedPieces.push(shortp);
                mixedPieces.push(longp);
            }
            // Sorting makes sure if one weekday (or abbr) is a prefix of another it
            // will match the longer piece.
            minPieces.sort(cmpLenRev);
            shortPieces.sort(cmpLenRev);
            longPieces.sort(cmpLenRev);
            mixedPieces.sort(cmpLenRev);

            this._weekdaysRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
            this._weekdaysShortRegex = this._weekdaysRegex;
            this._weekdaysMinRegex = this._weekdaysRegex;

            this._weekdaysStrictRegex = new RegExp(
                '^(' + longPieces.join('|') + ')',
                'i'
            );
            this._weekdaysShortStrictRegex = new RegExp(
                '^(' + shortPieces.join('|') + ')',
                'i'
            );
            this._weekdaysMinStrictRegex = new RegExp(
                '^(' + minPieces.join('|') + ')',
                'i'
            );
        }

        // FORMATTING

        function hFormat() {
            return this.hours() % 12 || 12;
        }

        function kFormat() {
            return this.hours() || 24;
        }

        addFormatToken('H', ['HH', 2], 0, 'hour');
        addFormatToken('h', ['hh', 2], 0, hFormat);
        addFormatToken('k', ['kk', 2], 0, kFormat);

        addFormatToken('hmm', 0, 0, function () {
            return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
        });

        addFormatToken('hmmss', 0, 0, function () {
            return (
                '' +
                hFormat.apply(this) +
                zeroFill(this.minutes(), 2) +
                zeroFill(this.seconds(), 2)
            );
        });

        addFormatToken('Hmm', 0, 0, function () {
            return '' + this.hours() + zeroFill(this.minutes(), 2);
        });

        addFormatToken('Hmmss', 0, 0, function () {
            return (
                '' +
                this.hours() +
                zeroFill(this.minutes(), 2) +
                zeroFill(this.seconds(), 2)
            );
        });

        function meridiem(token, lowercase) {
            addFormatToken(token, 0, 0, function () {
                return this.localeData().meridiem(
                    this.hours(),
                    this.minutes(),
                    lowercase
                );
            });
        }

        meridiem('a', true);
        meridiem('A', false);

        // ALIASES

        addUnitAlias('hour', 'h');

        // PRIORITY
        addUnitPriority('hour', 13);

        // PARSING

        function matchMeridiem(isStrict, locale) {
            return locale._meridiemParse;
        }

        addRegexToken('a', matchMeridiem);
        addRegexToken('A', matchMeridiem);
        addRegexToken('H', match1to2);
        addRegexToken('h', match1to2);
        addRegexToken('k', match1to2);
        addRegexToken('HH', match1to2, match2);
        addRegexToken('hh', match1to2, match2);
        addRegexToken('kk', match1to2, match2);

        addRegexToken('hmm', match3to4);
        addRegexToken('hmmss', match5to6);
        addRegexToken('Hmm', match3to4);
        addRegexToken('Hmmss', match5to6);

        addParseToken(['H', 'HH'], HOUR);
        addParseToken(['k', 'kk'], function (input, array, config) {
            var kInput = toInt(input);
            array[HOUR] = kInput === 24 ? 0 : kInput;
        });
        addParseToken(['a', 'A'], function (input, array, config) {
            config._isPm = config._locale.isPM(input);
            config._meridiem = input;
        });
        addParseToken(['h', 'hh'], function (input, array, config) {
            array[HOUR] = toInt(input);
            getParsingFlags(config).bigHour = true;
        });
        addParseToken('hmm', function (input, array, config) {
            var pos = input.length - 2;
            array[HOUR] = toInt(input.substr(0, pos));
            array[MINUTE] = toInt(input.substr(pos));
            getParsingFlags(config).bigHour = true;
        });
        addParseToken('hmmss', function (input, array, config) {
            var pos1 = input.length - 4,
                pos2 = input.length - 2;
            array[HOUR] = toInt(input.substr(0, pos1));
            array[MINUTE] = toInt(input.substr(pos1, 2));
            array[SECOND] = toInt(input.substr(pos2));
            getParsingFlags(config).bigHour = true;
        });
        addParseToken('Hmm', function (input, array, config) {
            var pos = input.length - 2;
            array[HOUR] = toInt(input.substr(0, pos));
            array[MINUTE] = toInt(input.substr(pos));
        });
        addParseToken('Hmmss', function (input, array, config) {
            var pos1 = input.length - 4,
                pos2 = input.length - 2;
            array[HOUR] = toInt(input.substr(0, pos1));
            array[MINUTE] = toInt(input.substr(pos1, 2));
            array[SECOND] = toInt(input.substr(pos2));
        });

        // LOCALES

        function localeIsPM(input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return (input + '').toLowerCase().charAt(0) === 'p';
        }

        var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i,
            // Setting the hour should keep the time, because the user explicitly
            // specified which hour they want. So trying to maintain the same hour (in
            // a new timezone) makes sense. Adding/subtracting hours does not follow
            // this rule.
            getSetHour = makeGetSet('Hours', true);

        function localeMeridiem(hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        }

        var baseConfig = {
            calendar: defaultCalendar,
            longDateFormat: defaultLongDateFormat,
            invalidDate: defaultInvalidDate,
            ordinal: defaultOrdinal,
            dayOfMonthOrdinalParse: defaultDayOfMonthOrdinalParse,
            relativeTime: defaultRelativeTime,

            months: defaultLocaleMonths,
            monthsShort: defaultLocaleMonthsShort,

            week: defaultLocaleWeek,

            weekdays: defaultLocaleWeekdays,
            weekdaysMin: defaultLocaleWeekdaysMin,
            weekdaysShort: defaultLocaleWeekdaysShort,

            meridiemParse: defaultLocaleMeridiemParse,
        };

        // internal storage for locale config files
        var locales = {},
            localeFamilies = {},
            globalLocale;

        function commonPrefix(arr1, arr2) {
            var i,
                minl = Math.min(arr1.length, arr2.length);
            for (i = 0; i < minl; i += 1) {
                if (arr1[i] !== arr2[i]) {
                    return i;
                }
            }
            return minl;
        }

        function normalizeLocale(key) {
            return key ? key.toLowerCase().replace('_', '-') : key;
        }

        // pick the locale from the array
        // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
        // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
        function chooseLocale(names) {
            var i = 0,
                j,
                next,
                locale,
                split;

            while (i < names.length) {
                split = normalizeLocale(names[i]).split('-');
                j = split.length;
                next = normalizeLocale(names[i + 1]);
                next = next ? next.split('-') : null;
                while (j > 0) {
                    locale = loadLocale(split.slice(0, j).join('-'));
                    if (locale) {
                        return locale;
                    }
                    if (
                        next &&
                        next.length >= j &&
                        commonPrefix(split, next) >= j - 1
                    ) {
                        //the next array item is better than a shallower substring of this one
                        break;
                    }
                    j--;
                }
                i++;
            }
            return globalLocale;
        }

        function isLocaleNameSane(name) {
            // Prevent names that look like filesystem paths, i.e contain '/' or '\'
            return name.match('^[^/\\\\]*$') != null;
        }

        function loadLocale(name) {
            var oldLocale = null,
                aliasedRequire;
            // TODO: Find a better way to register and load all the locales in Node
            if (
                locales[name] === undefined &&
                'object' !== 'undefined' &&
                module &&
                module.exports &&
                isLocaleNameSane(name)
            ) {
                try {
                    oldLocale = globalLocale._abbr;
                    aliasedRequire = commonjsRequire;
                    aliasedRequire('./locale/' + name);
                    getSetGlobalLocale(oldLocale);
                } catch (e) {
                    // mark as not found to avoid repeating expensive file require call causing high CPU
                    // when trying to find en-US, en_US, en-us for every format call
                    locales[name] = null; // null means not found
                }
            }
            return locales[name];
        }

        // This function will load locale and then set the global locale.  If
        // no arguments are passed in, it will simply return the current global
        // locale key.
        function getSetGlobalLocale(key, values) {
            var data;
            if (key) {
                if (isUndefined(values)) {
                    data = getLocale(key);
                } else {
                    data = defineLocale(key, values);
                }

                if (data) {
                    // moment.duration._locale = moment._locale = data;
                    globalLocale = data;
                } else {
                    if (typeof console !== 'undefined' && console.warn) {
                        //warn user if arguments are passed but the locale could not be set
                        console.warn(
                            'Locale ' + key + ' not found. Did you forget to load it?'
                        );
                    }
                }
            }

            return globalLocale._abbr;
        }

        function defineLocale(name, config) {
            if (config !== null) {
                var locale,
                    parentConfig = baseConfig;
                config.abbr = name;
                if (locales[name] != null) {
                    deprecateSimple(
                        'defineLocaleOverride',
                        'use moment.updateLocale(localeName, config) to change ' +
                            'an existing locale. moment.defineLocale(localeName, ' +
                            'config) should only be used for creating a new locale ' +
                            'See http://momentjs.com/guides/#/warnings/define-locale/ for more info.'
                    );
                    parentConfig = locales[name]._config;
                } else if (config.parentLocale != null) {
                    if (locales[config.parentLocale] != null) {
                        parentConfig = locales[config.parentLocale]._config;
                    } else {
                        locale = loadLocale(config.parentLocale);
                        if (locale != null) {
                            parentConfig = locale._config;
                        } else {
                            if (!localeFamilies[config.parentLocale]) {
                                localeFamilies[config.parentLocale] = [];
                            }
                            localeFamilies[config.parentLocale].push({
                                name: name,
                                config: config,
                            });
                            return null;
                        }
                    }
                }
                locales[name] = new Locale(mergeConfigs(parentConfig, config));

                if (localeFamilies[name]) {
                    localeFamilies[name].forEach(function (x) {
                        defineLocale(x.name, x.config);
                    });
                }

                // backwards compat for now: also set the locale
                // make sure we set the locale AFTER all child locales have been
                // created, so we won't end up with the child locale set.
                getSetGlobalLocale(name);

                return locales[name];
            } else {
                // useful for testing
                delete locales[name];
                return null;
            }
        }

        function updateLocale(name, config) {
            if (config != null) {
                var locale,
                    tmpLocale,
                    parentConfig = baseConfig;

                if (locales[name] != null && locales[name].parentLocale != null) {
                    // Update existing child locale in-place to avoid memory-leaks
                    locales[name].set(mergeConfigs(locales[name]._config, config));
                } else {
                    // MERGE
                    tmpLocale = loadLocale(name);
                    if (tmpLocale != null) {
                        parentConfig = tmpLocale._config;
                    }
                    config = mergeConfigs(parentConfig, config);
                    if (tmpLocale == null) {
                        // updateLocale is called for creating a new locale
                        // Set abbr so it will have a name (getters return
                        // undefined otherwise).
                        config.abbr = name;
                    }
                    locale = new Locale(config);
                    locale.parentLocale = locales[name];
                    locales[name] = locale;
                }

                // backwards compat for now: also set the locale
                getSetGlobalLocale(name);
            } else {
                // pass null for config to unupdate, useful for tests
                if (locales[name] != null) {
                    if (locales[name].parentLocale != null) {
                        locales[name] = locales[name].parentLocale;
                        if (name === getSetGlobalLocale()) {
                            getSetGlobalLocale(name);
                        }
                    } else if (locales[name] != null) {
                        delete locales[name];
                    }
                }
            }
            return locales[name];
        }

        // returns locale data
        function getLocale(key) {
            var locale;

            if (key && key._locale && key._locale._abbr) {
                key = key._locale._abbr;
            }

            if (!key) {
                return globalLocale;
            }

            if (!isArray(key)) {
                //short-circuit everything else
                locale = loadLocale(key);
                if (locale) {
                    return locale;
                }
                key = [key];
            }

            return chooseLocale(key);
        }

        function listLocales() {
            return keys(locales);
        }

        function checkOverflow(m) {
            var overflow,
                a = m._a;

            if (a && getParsingFlags(m).overflow === -2) {
                overflow =
                    a[MONTH] < 0 || a[MONTH] > 11
                        ? MONTH
                        : a[DATE] < 1 || a[DATE] > daysInMonth(a[YEAR], a[MONTH])
                        ? DATE
                        : a[HOUR] < 0 ||
                          a[HOUR] > 24 ||
                          (a[HOUR] === 24 &&
                              (a[MINUTE] !== 0 ||
                                  a[SECOND] !== 0 ||
                                  a[MILLISECOND] !== 0))
                        ? HOUR
                        : a[MINUTE] < 0 || a[MINUTE] > 59
                        ? MINUTE
                        : a[SECOND] < 0 || a[SECOND] > 59
                        ? SECOND
                        : a[MILLISECOND] < 0 || a[MILLISECOND] > 999
                        ? MILLISECOND
                        : -1;

                if (
                    getParsingFlags(m)._overflowDayOfYear &&
                    (overflow < YEAR || overflow > DATE)
                ) {
                    overflow = DATE;
                }
                if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
                    overflow = WEEK;
                }
                if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
                    overflow = WEEKDAY;
                }

                getParsingFlags(m).overflow = overflow;
            }

            return m;
        }

        // iso 8601 regex
        // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        var extendedIsoRegex =
                /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([+-]\d\d(?::?\d\d)?|\s*Z)?)?$/,
            basicIsoRegex =
                /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d|))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([+-]\d\d(?::?\d\d)?|\s*Z)?)?$/,
            tzRegex = /Z|[+-]\d\d(?::?\d\d)?/,
            isoDates = [
                ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
                ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
                ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
                ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
                ['YYYY-DDD', /\d{4}-\d{3}/],
                ['YYYY-MM', /\d{4}-\d\d/, false],
                ['YYYYYYMMDD', /[+-]\d{10}/],
                ['YYYYMMDD', /\d{8}/],
                ['GGGG[W]WWE', /\d{4}W\d{3}/],
                ['GGGG[W]WW', /\d{4}W\d{2}/, false],
                ['YYYYDDD', /\d{7}/],
                ['YYYYMM', /\d{6}/, false],
                ['YYYY', /\d{4}/, false],
            ],
            // iso time formats and regexes
            isoTimes = [
                ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
                ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
                ['HH:mm:ss', /\d\d:\d\d:\d\d/],
                ['HH:mm', /\d\d:\d\d/],
                ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
                ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
                ['HHmmss', /\d\d\d\d\d\d/],
                ['HHmm', /\d\d\d\d/],
                ['HH', /\d\d/],
            ],
            aspNetJsonRegex = /^\/?Date\((-?\d+)/i,
            // RFC 2822 regex: For details see https://tools.ietf.org/html/rfc2822#section-3.3
            rfc2822 =
                /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|([+-]\d{4}))$/,
            obsOffsets = {
                UT: 0,
                GMT: 0,
                EDT: -4 * 60,
                EST: -5 * 60,
                CDT: -5 * 60,
                CST: -6 * 60,
                MDT: -6 * 60,
                MST: -7 * 60,
                PDT: -7 * 60,
                PST: -8 * 60,
            };

        // date from iso format
        function configFromISO(config) {
            var i,
                l,
                string = config._i,
                match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
                allowTime,
                dateFormat,
                timeFormat,
                tzFormat,
                isoDatesLen = isoDates.length,
                isoTimesLen = isoTimes.length;

            if (match) {
                getParsingFlags(config).iso = true;
                for (i = 0, l = isoDatesLen; i < l; i++) {
                    if (isoDates[i][1].exec(match[1])) {
                        dateFormat = isoDates[i][0];
                        allowTime = isoDates[i][2] !== false;
                        break;
                    }
                }
                if (dateFormat == null) {
                    config._isValid = false;
                    return;
                }
                if (match[3]) {
                    for (i = 0, l = isoTimesLen; i < l; i++) {
                        if (isoTimes[i][1].exec(match[3])) {
                            // match[2] should be 'T' or space
                            timeFormat = (match[2] || ' ') + isoTimes[i][0];
                            break;
                        }
                    }
                    if (timeFormat == null) {
                        config._isValid = false;
                        return;
                    }
                }
                if (!allowTime && timeFormat != null) {
                    config._isValid = false;
                    return;
                }
                if (match[4]) {
                    if (tzRegex.exec(match[4])) {
                        tzFormat = 'Z';
                    } else {
                        config._isValid = false;
                        return;
                    }
                }
                config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
                configFromStringAndFormat(config);
            } else {
                config._isValid = false;
            }
        }

        function extractFromRFC2822Strings(
            yearStr,
            monthStr,
            dayStr,
            hourStr,
            minuteStr,
            secondStr
        ) {
            var result = [
                untruncateYear(yearStr),
                defaultLocaleMonthsShort.indexOf(monthStr),
                parseInt(dayStr, 10),
                parseInt(hourStr, 10),
                parseInt(minuteStr, 10),
            ];

            if (secondStr) {
                result.push(parseInt(secondStr, 10));
            }

            return result;
        }

        function untruncateYear(yearStr) {
            var year = parseInt(yearStr, 10);
            if (year <= 49) {
                return 2000 + year;
            } else if (year <= 999) {
                return 1900 + year;
            }
            return year;
        }

        function preprocessRFC2822(s) {
            // Remove comments and folding whitespace and replace multiple-spaces with a single space
            return s
                .replace(/\([^()]*\)|[\n\t]/g, ' ')
                .replace(/(\s\s+)/g, ' ')
                .replace(/^\s\s*/, '')
                .replace(/\s\s*$/, '');
        }

        function checkWeekday(weekdayStr, parsedInput, config) {
            if (weekdayStr) {
                // TODO: Replace the vanilla JS Date object with an independent day-of-week check.
                var weekdayProvided = defaultLocaleWeekdaysShort.indexOf(weekdayStr),
                    weekdayActual = new Date(
                        parsedInput[0],
                        parsedInput[1],
                        parsedInput[2]
                    ).getDay();
                if (weekdayProvided !== weekdayActual) {
                    getParsingFlags(config).weekdayMismatch = true;
                    config._isValid = false;
                    return false;
                }
            }
            return true;
        }

        function calculateOffset(obsOffset, militaryOffset, numOffset) {
            if (obsOffset) {
                return obsOffsets[obsOffset];
            } else if (militaryOffset) {
                // the only allowed military tz is Z
                return 0;
            } else {
                var hm = parseInt(numOffset, 10),
                    m = hm % 100,
                    h = (hm - m) / 100;
                return h * 60 + m;
            }
        }

        // date and time from ref 2822 format
        function configFromRFC2822(config) {
            var match = rfc2822.exec(preprocessRFC2822(config._i)),
                parsedArray;
            if (match) {
                parsedArray = extractFromRFC2822Strings(
                    match[4],
                    match[3],
                    match[2],
                    match[5],
                    match[6],
                    match[7]
                );
                if (!checkWeekday(match[1], parsedArray, config)) {
                    return;
                }

                config._a = parsedArray;
                config._tzm = calculateOffset(match[8], match[9], match[10]);

                config._d = createUTCDate.apply(null, config._a);
                config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);

                getParsingFlags(config).rfc2822 = true;
            } else {
                config._isValid = false;
            }
        }

        // date from 1) ASP.NET, 2) ISO, 3) RFC 2822 formats, or 4) optional fallback if parsing isn't strict
        function configFromString(config) {
            var matched = aspNetJsonRegex.exec(config._i);
            if (matched !== null) {
                config._d = new Date(+matched[1]);
                return;
            }

            configFromISO(config);
            if (config._isValid === false) {
                delete config._isValid;
            } else {
                return;
            }

            configFromRFC2822(config);
            if (config._isValid === false) {
                delete config._isValid;
            } else {
                return;
            }

            if (config._strict) {
                config._isValid = false;
            } else {
                // Final attempt, use Input Fallback
                hooks.createFromInputFallback(config);
            }
        }

        hooks.createFromInputFallback = deprecate(
            'value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), ' +
                'which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are ' +
                'discouraged. Please refer to http://momentjs.com/guides/#/warnings/js-date/ for more info.',
            function (config) {
                config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
            }
        );

        // Pick the first defined of two or three arguments.
        function defaults(a, b, c) {
            if (a != null) {
                return a;
            }
            if (b != null) {
                return b;
            }
            return c;
        }

        function currentDateArray(config) {
            // hooks is actually the exported moment object
            var nowValue = new Date(hooks.now());
            if (config._useUTC) {
                return [
                    nowValue.getUTCFullYear(),
                    nowValue.getUTCMonth(),
                    nowValue.getUTCDate(),
                ];
            }
            return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
        }

        // convert an array to a date.
        // the array should mirror the parameters below
        // note: all values past the year are optional and will default to the lowest possible value.
        // [year, month, day , hour, minute, second, millisecond]
        function configFromArray(config) {
            var i,
                date,
                input = [],
                currentDate,
                expectedWeekday,
                yearToUse;

            if (config._d) {
                return;
            }

            currentDate = currentDateArray(config);

            //compute day of the year from weeks and weekdays
            if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
                dayOfYearFromWeekInfo(config);
            }

            //if the day of the year is set, figure out what it is
            if (config._dayOfYear != null) {
                yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

                if (
                    config._dayOfYear > daysInYear(yearToUse) ||
                    config._dayOfYear === 0
                ) {
                    getParsingFlags(config)._overflowDayOfYear = true;
                }

                date = createUTCDate(yearToUse, 0, config._dayOfYear);
                config._a[MONTH] = date.getUTCMonth();
                config._a[DATE] = date.getUTCDate();
            }

            // Default to current date.
            // * if no year, month, day of month are given, default to today
            // * if day of month is given, default month and year
            // * if month is given, default only year
            // * if year is given, don't default anything
            for (i = 0; i < 3 && config._a[i] == null; ++i) {
                config._a[i] = input[i] = currentDate[i];
            }

            // Zero out whatever was not defaulted, including time
            for (; i < 7; i++) {
                config._a[i] = input[i] =
                    config._a[i] == null ? (i === 2 ? 1 : 0) : config._a[i];
            }

            // Check for 24:00:00.000
            if (
                config._a[HOUR] === 24 &&
                config._a[MINUTE] === 0 &&
                config._a[SECOND] === 0 &&
                config._a[MILLISECOND] === 0
            ) {
                config._nextDay = true;
                config._a[HOUR] = 0;
            }

            config._d = (config._useUTC ? createUTCDate : createDate).apply(
                null,
                input
            );
            expectedWeekday = config._useUTC
                ? config._d.getUTCDay()
                : config._d.getDay();

            // Apply timezone offset from input. The actual utcOffset can be changed
            // with parseZone.
            if (config._tzm != null) {
                config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
            }

            if (config._nextDay) {
                config._a[HOUR] = 24;
            }

            // check for mismatching day of week
            if (
                config._w &&
                typeof config._w.d !== 'undefined' &&
                config._w.d !== expectedWeekday
            ) {
                getParsingFlags(config).weekdayMismatch = true;
            }
        }

        function dayOfYearFromWeekInfo(config) {
            var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow, curWeek;

            w = config._w;
            if (w.GG != null || w.W != null || w.E != null) {
                dow = 1;
                doy = 4;

                // TODO: We need to take the current isoWeekYear, but that depends on
                // how we interpret now (local, utc, fixed offset). So create
                // a now version of current config (take local/utc/offset flags, and
                // create now).
                weekYear = defaults(
                    w.GG,
                    config._a[YEAR],
                    weekOfYear(createLocal(), 1, 4).year
                );
                week = defaults(w.W, 1);
                weekday = defaults(w.E, 1);
                if (weekday < 1 || weekday > 7) {
                    weekdayOverflow = true;
                }
            } else {
                dow = config._locale._week.dow;
                doy = config._locale._week.doy;

                curWeek = weekOfYear(createLocal(), dow, doy);

                weekYear = defaults(w.gg, config._a[YEAR], curWeek.year);

                // Default to current week.
                week = defaults(w.w, curWeek.week);

                if (w.d != null) {
                    // weekday -- low day numbers are considered next week
                    weekday = w.d;
                    if (weekday < 0 || weekday > 6) {
                        weekdayOverflow = true;
                    }
                } else if (w.e != null) {
                    // local weekday -- counting starts from beginning of week
                    weekday = w.e + dow;
                    if (w.e < 0 || w.e > 6) {
                        weekdayOverflow = true;
                    }
                } else {
                    // default to beginning of week
                    weekday = dow;
                }
            }
            if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
                getParsingFlags(config)._overflowWeeks = true;
            } else if (weekdayOverflow != null) {
                getParsingFlags(config)._overflowWeekday = true;
            } else {
                temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
                config._a[YEAR] = temp.year;
                config._dayOfYear = temp.dayOfYear;
            }
        }

        // constant that refers to the ISO standard
        hooks.ISO_8601 = function () {};

        // constant that refers to the RFC 2822 form
        hooks.RFC_2822 = function () {};

        // date from string and format string
        function configFromStringAndFormat(config) {
            // TODO: Move this to another part of the creation flow to prevent circular deps
            if (config._f === hooks.ISO_8601) {
                configFromISO(config);
                return;
            }
            if (config._f === hooks.RFC_2822) {
                configFromRFC2822(config);
                return;
            }
            config._a = [];
            getParsingFlags(config).empty = true;

            // This array is used to make a Date, either with `new Date` or `Date.UTC`
            var string = '' + config._i,
                i,
                parsedInput,
                tokens,
                token,
                skipped,
                stringLength = string.length,
                totalParsedInputLength = 0,
                era,
                tokenLen;

            tokens =
                expandFormat(config._f, config._locale).match(formattingTokens) || [];
            tokenLen = tokens.length;
            for (i = 0; i < tokenLen; i++) {
                token = tokens[i];
                parsedInput = (string.match(getParseRegexForToken(token, config)) ||
                    [])[0];
                if (parsedInput) {
                    skipped = string.substr(0, string.indexOf(parsedInput));
                    if (skipped.length > 0) {
                        getParsingFlags(config).unusedInput.push(skipped);
                    }
                    string = string.slice(
                        string.indexOf(parsedInput) + parsedInput.length
                    );
                    totalParsedInputLength += parsedInput.length;
                }
                // don't parse if it's not a known token
                if (formatTokenFunctions[token]) {
                    if (parsedInput) {
                        getParsingFlags(config).empty = false;
                    } else {
                        getParsingFlags(config).unusedTokens.push(token);
                    }
                    addTimeToArrayFromToken(token, parsedInput, config);
                } else if (config._strict && !parsedInput) {
                    getParsingFlags(config).unusedTokens.push(token);
                }
            }

            // add remaining unparsed input length to the string
            getParsingFlags(config).charsLeftOver =
                stringLength - totalParsedInputLength;
            if (string.length > 0) {
                getParsingFlags(config).unusedInput.push(string);
            }

            // clear _12h flag if hour is <= 12
            if (
                config._a[HOUR] <= 12 &&
                getParsingFlags(config).bigHour === true &&
                config._a[HOUR] > 0
            ) {
                getParsingFlags(config).bigHour = undefined;
            }

            getParsingFlags(config).parsedDateParts = config._a.slice(0);
            getParsingFlags(config).meridiem = config._meridiem;
            // handle meridiem
            config._a[HOUR] = meridiemFixWrap(
                config._locale,
                config._a[HOUR],
                config._meridiem
            );

            // handle era
            era = getParsingFlags(config).era;
            if (era !== null) {
                config._a[YEAR] = config._locale.erasConvertYear(era, config._a[YEAR]);
            }

            configFromArray(config);
            checkOverflow(config);
        }

        function meridiemFixWrap(locale, hour, meridiem) {
            var isPm;

            if (meridiem == null) {
                // nothing to do
                return hour;
            }
            if (locale.meridiemHour != null) {
                return locale.meridiemHour(hour, meridiem);
            } else if (locale.isPM != null) {
                // Fallback
                isPm = locale.isPM(meridiem);
                if (isPm && hour < 12) {
                    hour += 12;
                }
                if (!isPm && hour === 12) {
                    hour = 0;
                }
                return hour;
            } else {
                // this is not supposed to happen
                return hour;
            }
        }

        // date from string and array of format strings
        function configFromStringAndArray(config) {
            var tempConfig,
                bestMoment,
                scoreToBeat,
                i,
                currentScore,
                validFormatFound,
                bestFormatIsValid = false,
                configfLen = config._f.length;

            if (configfLen === 0) {
                getParsingFlags(config).invalidFormat = true;
                config._d = new Date(NaN);
                return;
            }

            for (i = 0; i < configfLen; i++) {
                currentScore = 0;
                validFormatFound = false;
                tempConfig = copyConfig({}, config);
                if (config._useUTC != null) {
                    tempConfig._useUTC = config._useUTC;
                }
                tempConfig._f = config._f[i];
                configFromStringAndFormat(tempConfig);

                if (isValid(tempConfig)) {
                    validFormatFound = true;
                }

                // if there is any input that was not parsed add a penalty for that format
                currentScore += getParsingFlags(tempConfig).charsLeftOver;

                //or tokens
                currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

                getParsingFlags(tempConfig).score = currentScore;

                if (!bestFormatIsValid) {
                    if (
                        scoreToBeat == null ||
                        currentScore < scoreToBeat ||
                        validFormatFound
                    ) {
                        scoreToBeat = currentScore;
                        bestMoment = tempConfig;
                        if (validFormatFound) {
                            bestFormatIsValid = true;
                        }
                    }
                } else {
                    if (currentScore < scoreToBeat) {
                        scoreToBeat = currentScore;
                        bestMoment = tempConfig;
                    }
                }
            }

            extend(config, bestMoment || tempConfig);
        }

        function configFromObject(config) {
            if (config._d) {
                return;
            }

            var i = normalizeObjectUnits(config._i),
                dayOrDate = i.day === undefined ? i.date : i.day;
            config._a = map(
                [i.year, i.month, dayOrDate, i.hour, i.minute, i.second, i.millisecond],
                function (obj) {
                    return obj && parseInt(obj, 10);
                }
            );

            configFromArray(config);
        }

        function createFromConfig(config) {
            var res = new Moment(checkOverflow(prepareConfig(config)));
            if (res._nextDay) {
                // Adding is smart enough around DST
                res.add(1, 'd');
                res._nextDay = undefined;
            }

            return res;
        }

        function prepareConfig(config) {
            var input = config._i,
                format = config._f;

            config._locale = config._locale || getLocale(config._l);

            if (input === null || (format === undefined && input === '')) {
                return createInvalid({ nullInput: true });
            }

            if (typeof input === 'string') {
                config._i = input = config._locale.preparse(input);
            }

            if (isMoment(input)) {
                return new Moment(checkOverflow(input));
            } else if (isDate(input)) {
                config._d = input;
            } else if (isArray(format)) {
                configFromStringAndArray(config);
            } else if (format) {
                configFromStringAndFormat(config);
            } else {
                configFromInput(config);
            }

            if (!isValid(config)) {
                config._d = null;
            }

            return config;
        }

        function configFromInput(config) {
            var input = config._i;
            if (isUndefined(input)) {
                config._d = new Date(hooks.now());
            } else if (isDate(input)) {
                config._d = new Date(input.valueOf());
            } else if (typeof input === 'string') {
                configFromString(config);
            } else if (isArray(input)) {
                config._a = map(input.slice(0), function (obj) {
                    return parseInt(obj, 10);
                });
                configFromArray(config);
            } else if (isObject(input)) {
                configFromObject(config);
            } else if (isNumber(input)) {
                // from milliseconds
                config._d = new Date(input);
            } else {
                hooks.createFromInputFallback(config);
            }
        }

        function createLocalOrUTC(input, format, locale, strict, isUTC) {
            var c = {};

            if (format === true || format === false) {
                strict = format;
                format = undefined;
            }

            if (locale === true || locale === false) {
                strict = locale;
                locale = undefined;
            }

            if (
                (isObject(input) && isObjectEmpty(input)) ||
                (isArray(input) && input.length === 0)
            ) {
                input = undefined;
            }
            // object construction must be done this way.
            // https://github.com/moment/moment/issues/1423
            c._isAMomentObject = true;
            c._useUTC = c._isUTC = isUTC;
            c._l = locale;
            c._i = input;
            c._f = format;
            c._strict = strict;

            return createFromConfig(c);
        }

        function createLocal(input, format, locale, strict) {
            return createLocalOrUTC(input, format, locale, strict, false);
        }

        var prototypeMin = deprecate(
                'moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/',
                function () {
                    var other = createLocal.apply(null, arguments);
                    if (this.isValid() && other.isValid()) {
                        return other < this ? this : other;
                    } else {
                        return createInvalid();
                    }
                }
            ),
            prototypeMax = deprecate(
                'moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/',
                function () {
                    var other = createLocal.apply(null, arguments);
                    if (this.isValid() && other.isValid()) {
                        return other > this ? this : other;
                    } else {
                        return createInvalid();
                    }
                }
            );

        // Pick a moment m from moments so that m[fn](other) is true for all
        // other. This relies on the function fn to be transitive.
        //
        // moments should either be an array of moment objects or an array, whose
        // first element is an array of moment objects.
        function pickBy(fn, moments) {
            var res, i;
            if (moments.length === 1 && isArray(moments[0])) {
                moments = moments[0];
            }
            if (!moments.length) {
                return createLocal();
            }
            res = moments[0];
            for (i = 1; i < moments.length; ++i) {
                if (!moments[i].isValid() || moments[i][fn](res)) {
                    res = moments[i];
                }
            }
            return res;
        }

        // TODO: Use [].sort instead?
        function min() {
            var args = [].slice.call(arguments, 0);

            return pickBy('isBefore', args);
        }

        function max() {
            var args = [].slice.call(arguments, 0);

            return pickBy('isAfter', args);
        }

        var now = function () {
            return Date.now ? Date.now() : +new Date();
        };

        var ordering = [
            'year',
            'quarter',
            'month',
            'week',
            'day',
            'hour',
            'minute',
            'second',
            'millisecond',
        ];

        function isDurationValid(m) {
            var key,
                unitHasDecimal = false,
                i,
                orderLen = ordering.length;
            for (key in m) {
                if (
                    hasOwnProp(m, key) &&
                    !(
                        indexOf.call(ordering, key) !== -1 &&
                        (m[key] == null || !isNaN(m[key]))
                    )
                ) {
                    return false;
                }
            }

            for (i = 0; i < orderLen; ++i) {
                if (m[ordering[i]]) {
                    if (unitHasDecimal) {
                        return false; // only allow non-integers for smallest unit
                    }
                    if (parseFloat(m[ordering[i]]) !== toInt(m[ordering[i]])) {
                        unitHasDecimal = true;
                    }
                }
            }

            return true;
        }

        function isValid$1() {
            return this._isValid;
        }

        function createInvalid$1() {
            return createDuration(NaN);
        }

        function Duration(duration) {
            var normalizedInput = normalizeObjectUnits(duration),
                years = normalizedInput.year || 0,
                quarters = normalizedInput.quarter || 0,
                months = normalizedInput.month || 0,
                weeks = normalizedInput.week || normalizedInput.isoWeek || 0,
                days = normalizedInput.day || 0,
                hours = normalizedInput.hour || 0,
                minutes = normalizedInput.minute || 0,
                seconds = normalizedInput.second || 0,
                milliseconds = normalizedInput.millisecond || 0;

            this._isValid = isDurationValid(normalizedInput);

            // representation for dateAddRemove
            this._milliseconds =
                +milliseconds +
                seconds * 1e3 + // 1000
                minutes * 6e4 + // 1000 * 60
                hours * 1000 * 60 * 60; //using 1000 * 60 * 60 instead of 36e5 to avoid floating point rounding errors https://github.com/moment/moment/issues/2978
            // Because of dateAddRemove treats 24 hours as different from a
            // day when working around DST, we need to store them separately
            this._days = +days + weeks * 7;
            // It is impossible to translate months into days without knowing
            // which months you are are talking about, so we have to store
            // it separately.
            this._months = +months + quarters * 3 + years * 12;

            this._data = {};

            this._locale = getLocale();

            this._bubble();
        }

        function isDuration(obj) {
            return obj instanceof Duration;
        }

        function absRound(number) {
            if (number < 0) {
                return Math.round(-1 * number) * -1;
            } else {
                return Math.round(number);
            }
        }

        // compare two arrays, return the number of differences
        function compareArrays(array1, array2, dontConvert) {
            var len = Math.min(array1.length, array2.length),
                lengthDiff = Math.abs(array1.length - array2.length),
                diffs = 0,
                i;
            for (i = 0; i < len; i++) {
                if (
                    (dontConvert && array1[i] !== array2[i]) ||
                    (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))
                ) {
                    diffs++;
                }
            }
            return diffs + lengthDiff;
        }

        // FORMATTING

        function offset(token, separator) {
            addFormatToken(token, 0, 0, function () {
                var offset = this.utcOffset(),
                    sign = '+';
                if (offset < 0) {
                    offset = -offset;
                    sign = '-';
                }
                return (
                    sign +
                    zeroFill(~~(offset / 60), 2) +
                    separator +
                    zeroFill(~~offset % 60, 2)
                );
            });
        }

        offset('Z', ':');
        offset('ZZ', '');

        // PARSING

        addRegexToken('Z', matchShortOffset);
        addRegexToken('ZZ', matchShortOffset);
        addParseToken(['Z', 'ZZ'], function (input, array, config) {
            config._useUTC = true;
            config._tzm = offsetFromString(matchShortOffset, input);
        });

        // HELPERS

        // timezone chunker
        // '+10:00' > ['10',  '00']
        // '-1530'  > ['-15', '30']
        var chunkOffset = /([\+\-]|\d\d)/gi;

        function offsetFromString(matcher, string) {
            var matches = (string || '').match(matcher),
                chunk,
                parts,
                minutes;

            if (matches === null) {
                return null;
            }

            chunk = matches[matches.length - 1] || [];
            parts = (chunk + '').match(chunkOffset) || ['-', 0, 0];
            minutes = +(parts[1] * 60) + toInt(parts[2]);

            return minutes === 0 ? 0 : parts[0] === '+' ? minutes : -minutes;
        }

        // Return a moment from input, that is local/utc/zone equivalent to model.
        function cloneWithOffset(input, model) {
            var res, diff;
            if (model._isUTC) {
                res = model.clone();
                diff =
                    (isMoment(input) || isDate(input)
                        ? input.valueOf()
                        : createLocal(input).valueOf()) - res.valueOf();
                // Use low-level api, because this fn is low-level api.
                res._d.setTime(res._d.valueOf() + diff);
                hooks.updateOffset(res, false);
                return res;
            } else {
                return createLocal(input).local();
            }
        }

        function getDateOffset(m) {
            // On Firefox.24 Date#getTimezoneOffset returns a floating point.
            // https://github.com/moment/moment/pull/1871
            return -Math.round(m._d.getTimezoneOffset());
        }

        // HOOKS

        // This function will be called whenever a moment is mutated.
        // It is intended to keep the offset in sync with the timezone.
        hooks.updateOffset = function () {};

        // MOMENTS

        // keepLocalTime = true means only change the timezone, without
        // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
        // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
        // +0200, so we adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        function getSetOffset(input, keepLocalTime, keepMinutes) {
            var offset = this._offset || 0,
                localAdjust;
            if (!this.isValid()) {
                return input != null ? this : NaN;
            }
            if (input != null) {
                if (typeof input === 'string') {
                    input = offsetFromString(matchShortOffset, input);
                    if (input === null) {
                        return this;
                    }
                } else if (Math.abs(input) < 16 && !keepMinutes) {
                    input = input * 60;
                }
                if (!this._isUTC && keepLocalTime) {
                    localAdjust = getDateOffset(this);
                }
                this._offset = input;
                this._isUTC = true;
                if (localAdjust != null) {
                    this.add(localAdjust, 'm');
                }
                if (offset !== input) {
                    if (!keepLocalTime || this._changeInProgress) {
                        addSubtract(
                            this,
                            createDuration(input - offset, 'm'),
                            1,
                            false
                        );
                    } else if (!this._changeInProgress) {
                        this._changeInProgress = true;
                        hooks.updateOffset(this, true);
                        this._changeInProgress = null;
                    }
                }
                return this;
            } else {
                return this._isUTC ? offset : getDateOffset(this);
            }
        }

        function getSetZone(input, keepLocalTime) {
            if (input != null) {
                if (typeof input !== 'string') {
                    input = -input;
                }

                this.utcOffset(input, keepLocalTime);

                return this;
            } else {
                return -this.utcOffset();
            }
        }

        function setOffsetToUTC(keepLocalTime) {
            return this.utcOffset(0, keepLocalTime);
        }

        function setOffsetToLocal(keepLocalTime) {
            if (this._isUTC) {
                this.utcOffset(0, keepLocalTime);
                this._isUTC = false;

                if (keepLocalTime) {
                    this.subtract(getDateOffset(this), 'm');
                }
            }
            return this;
        }

        function setOffsetToParsedOffset() {
            if (this._tzm != null) {
                this.utcOffset(this._tzm, false, true);
            } else if (typeof this._i === 'string') {
                var tZone = offsetFromString(matchOffset, this._i);
                if (tZone != null) {
                    this.utcOffset(tZone);
                } else {
                    this.utcOffset(0, true);
                }
            }
            return this;
        }

        function hasAlignedHourOffset(input) {
            if (!this.isValid()) {
                return false;
            }
            input = input ? createLocal(input).utcOffset() : 0;

            return (this.utcOffset() - input) % 60 === 0;
        }

        function isDaylightSavingTime() {
            return (
                this.utcOffset() > this.clone().month(0).utcOffset() ||
                this.utcOffset() > this.clone().month(5).utcOffset()
            );
        }

        function isDaylightSavingTimeShifted() {
            if (!isUndefined(this._isDSTShifted)) {
                return this._isDSTShifted;
            }

            var c = {},
                other;

            copyConfig(c, this);
            c = prepareConfig(c);

            if (c._a) {
                other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
                this._isDSTShifted =
                    this.isValid() && compareArrays(c._a, other.toArray()) > 0;
            } else {
                this._isDSTShifted = false;
            }

            return this._isDSTShifted;
        }

        function isLocal() {
            return this.isValid() ? !this._isUTC : false;
        }

        function isUtcOffset() {
            return this.isValid() ? this._isUTC : false;
        }

        function isUtc() {
            return this.isValid() ? this._isUTC && this._offset === 0 : false;
        }

        // ASP.NET json date format regex
        var aspNetRegex = /^(-|\+)?(?:(\d*)[. ])?(\d+):(\d+)(?::(\d+)(\.\d*)?)?$/,
            // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
            // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
            // and further modified to allow for strings containing both week and day
            isoRegex =
                /^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/;

        function createDuration(input, key) {
            var duration = input,
                // matching against regexp is expensive, do it on demand
                match = null,
                sign,
                ret,
                diffRes;

            if (isDuration(input)) {
                duration = {
                    ms: input._milliseconds,
                    d: input._days,
                    M: input._months,
                };
            } else if (isNumber(input) || !isNaN(+input)) {
                duration = {};
                if (key) {
                    duration[key] = +input;
                } else {
                    duration.milliseconds = +input;
                }
            } else if ((match = aspNetRegex.exec(input))) {
                sign = match[1] === '-' ? -1 : 1;
                duration = {
                    y: 0,
                    d: toInt(match[DATE]) * sign,
                    h: toInt(match[HOUR]) * sign,
                    m: toInt(match[MINUTE]) * sign,
                    s: toInt(match[SECOND]) * sign,
                    ms: toInt(absRound(match[MILLISECOND] * 1000)) * sign, // the millisecond decimal point is included in the match
                };
            } else if ((match = isoRegex.exec(input))) {
                sign = match[1] === '-' ? -1 : 1;
                duration = {
                    y: parseIso(match[2], sign),
                    M: parseIso(match[3], sign),
                    w: parseIso(match[4], sign),
                    d: parseIso(match[5], sign),
                    h: parseIso(match[6], sign),
                    m: parseIso(match[7], sign),
                    s: parseIso(match[8], sign),
                };
            } else if (duration == null) {
                // checks for null or undefined
                duration = {};
            } else if (
                typeof duration === 'object' &&
                ('from' in duration || 'to' in duration)
            ) {
                diffRes = momentsDifference(
                    createLocal(duration.from),
                    createLocal(duration.to)
                );

                duration = {};
                duration.ms = diffRes.milliseconds;
                duration.M = diffRes.months;
            }

            ret = new Duration(duration);

            if (isDuration(input) && hasOwnProp(input, '_locale')) {
                ret._locale = input._locale;
            }

            if (isDuration(input) && hasOwnProp(input, '_isValid')) {
                ret._isValid = input._isValid;
            }

            return ret;
        }

        createDuration.fn = Duration.prototype;
        createDuration.invalid = createInvalid$1;

        function parseIso(inp, sign) {
            // We'd normally use ~~inp for this, but unfortunately it also
            // converts floats to ints.
            // inp may be undefined, so careful calling replace on it.
            var res = inp && parseFloat(inp.replace(',', '.'));
            // apply sign while we're at it
            return (isNaN(res) ? 0 : res) * sign;
        }

        function positiveMomentsDifference(base, other) {
            var res = {};

            res.months =
                other.month() - base.month() + (other.year() - base.year()) * 12;
            if (base.clone().add(res.months, 'M').isAfter(other)) {
                --res.months;
            }

            res.milliseconds = +other - +base.clone().add(res.months, 'M');

            return res;
        }

        function momentsDifference(base, other) {
            var res;
            if (!(base.isValid() && other.isValid())) {
                return { milliseconds: 0, months: 0 };
            }

            other = cloneWithOffset(other, base);
            if (base.isBefore(other)) {
                res = positiveMomentsDifference(base, other);
            } else {
                res = positiveMomentsDifference(other, base);
                res.milliseconds = -res.milliseconds;
                res.months = -res.months;
            }

            return res;
        }

        // TODO: remove 'name' arg after deprecation is removed
        function createAdder(direction, name) {
            return function (val, period) {
                var dur, tmp;
                //invert the arguments, but complain about it
                if (period !== null && !isNaN(+period)) {
                    deprecateSimple(
                        name,
                        'moment().' +
                            name +
                            '(period, number) is deprecated. Please use moment().' +
                            name +
                            '(number, period). ' +
                            'See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info.'
                    );
                    tmp = val;
                    val = period;
                    period = tmp;
                }

                dur = createDuration(val, period);
                addSubtract(this, dur, direction);
                return this;
            };
        }

        function addSubtract(mom, duration, isAdding, updateOffset) {
            var milliseconds = duration._milliseconds,
                days = absRound(duration._days),
                months = absRound(duration._months);

            if (!mom.isValid()) {
                // No op
                return;
            }

            updateOffset = updateOffset == null ? true : updateOffset;

            if (months) {
                setMonth(mom, get(mom, 'Month') + months * isAdding);
            }
            if (days) {
                set$1(mom, 'Date', get(mom, 'Date') + days * isAdding);
            }
            if (milliseconds) {
                mom._d.setTime(mom._d.valueOf() + milliseconds * isAdding);
            }
            if (updateOffset) {
                hooks.updateOffset(mom, days || months);
            }
        }

        var add = createAdder(1, 'add'),
            subtract = createAdder(-1, 'subtract');

        function isString(input) {
            return typeof input === 'string' || input instanceof String;
        }

        // type MomentInput = Moment | Date | string | number | (number | string)[] | MomentInputObject | void; // null | undefined
        function isMomentInput(input) {
            return (
                isMoment(input) ||
                isDate(input) ||
                isString(input) ||
                isNumber(input) ||
                isNumberOrStringArray(input) ||
                isMomentInputObject(input) ||
                input === null ||
                input === undefined
            );
        }

        function isMomentInputObject(input) {
            var objectTest = isObject(input) && !isObjectEmpty(input),
                propertyTest = false,
                properties = [
                    'years',
                    'year',
                    'y',
                    'months',
                    'month',
                    'M',
                    'days',
                    'day',
                    'd',
                    'dates',
                    'date',
                    'D',
                    'hours',
                    'hour',
                    'h',
                    'minutes',
                    'minute',
                    'm',
                    'seconds',
                    'second',
                    's',
                    'milliseconds',
                    'millisecond',
                    'ms',
                ],
                i,
                property,
                propertyLen = properties.length;

            for (i = 0; i < propertyLen; i += 1) {
                property = properties[i];
                propertyTest = propertyTest || hasOwnProp(input, property);
            }

            return objectTest && propertyTest;
        }

        function isNumberOrStringArray(input) {
            var arrayTest = isArray(input),
                dataTypeTest = false;
            if (arrayTest) {
                dataTypeTest =
                    input.filter(function (item) {
                        return !isNumber(item) && isString(input);
                    }).length === 0;
            }
            return arrayTest && dataTypeTest;
        }

        function isCalendarSpec(input) {
            var objectTest = isObject(input) && !isObjectEmpty(input),
                propertyTest = false,
                properties = [
                    'sameDay',
                    'nextDay',
                    'lastDay',
                    'nextWeek',
                    'lastWeek',
                    'sameElse',
                ],
                i,
                property;

            for (i = 0; i < properties.length; i += 1) {
                property = properties[i];
                propertyTest = propertyTest || hasOwnProp(input, property);
            }

            return objectTest && propertyTest;
        }

        function getCalendarFormat(myMoment, now) {
            var diff = myMoment.diff(now, 'days', true);
            return diff < -6
                ? 'sameElse'
                : diff < -1
                ? 'lastWeek'
                : diff < 0
                ? 'lastDay'
                : diff < 1
                ? 'sameDay'
                : diff < 2
                ? 'nextDay'
                : diff < 7
                ? 'nextWeek'
                : 'sameElse';
        }

        function calendar$1(time, formats) {
            // Support for single parameter, formats only overload to the calendar function
            if (arguments.length === 1) {
                if (!arguments[0]) {
                    time = undefined;
                    formats = undefined;
                } else if (isMomentInput(arguments[0])) {
                    time = arguments[0];
                    formats = undefined;
                } else if (isCalendarSpec(arguments[0])) {
                    formats = arguments[0];
                    time = undefined;
                }
            }
            // We want to compare the start of today, vs this.
            // Getting start-of-today depends on whether we're local/utc/offset or not.
            var now = time || createLocal(),
                sod = cloneWithOffset(now, this).startOf('day'),
                format = hooks.calendarFormat(this, sod) || 'sameElse',
                output =
                    formats &&
                    (isFunction(formats[format])
                        ? formats[format].call(this, now)
                        : formats[format]);

            return this.format(
                output || this.localeData().calendar(format, this, createLocal(now))
            );
        }

        function clone() {
            return new Moment(this);
        }

        function isAfter(input, units) {
            var localInput = isMoment(input) ? input : createLocal(input);
            if (!(this.isValid() && localInput.isValid())) {
                return false;
            }
            units = normalizeUnits(units) || 'millisecond';
            if (units === 'millisecond') {
                return this.valueOf() > localInput.valueOf();
            } else {
                return localInput.valueOf() < this.clone().startOf(units).valueOf();
            }
        }

        function isBefore(input, units) {
            var localInput = isMoment(input) ? input : createLocal(input);
            if (!(this.isValid() && localInput.isValid())) {
                return false;
            }
            units = normalizeUnits(units) || 'millisecond';
            if (units === 'millisecond') {
                return this.valueOf() < localInput.valueOf();
            } else {
                return this.clone().endOf(units).valueOf() < localInput.valueOf();
            }
        }

        function isBetween(from, to, units, inclusivity) {
            var localFrom = isMoment(from) ? from : createLocal(from),
                localTo = isMoment(to) ? to : createLocal(to);
            if (!(this.isValid() && localFrom.isValid() && localTo.isValid())) {
                return false;
            }
            inclusivity = inclusivity || '()';
            return (
                (inclusivity[0] === '('
                    ? this.isAfter(localFrom, units)
                    : !this.isBefore(localFrom, units)) &&
                (inclusivity[1] === ')'
                    ? this.isBefore(localTo, units)
                    : !this.isAfter(localTo, units))
            );
        }

        function isSame(input, units) {
            var localInput = isMoment(input) ? input : createLocal(input),
                inputMs;
            if (!(this.isValid() && localInput.isValid())) {
                return false;
            }
            units = normalizeUnits(units) || 'millisecond';
            if (units === 'millisecond') {
                return this.valueOf() === localInput.valueOf();
            } else {
                inputMs = localInput.valueOf();
                return (
                    this.clone().startOf(units).valueOf() <= inputMs &&
                    inputMs <= this.clone().endOf(units).valueOf()
                );
            }
        }

        function isSameOrAfter(input, units) {
            return this.isSame(input, units) || this.isAfter(input, units);
        }

        function isSameOrBefore(input, units) {
            return this.isSame(input, units) || this.isBefore(input, units);
        }

        function diff(input, units, asFloat) {
            var that, zoneDelta, output;

            if (!this.isValid()) {
                return NaN;
            }

            that = cloneWithOffset(input, this);

            if (!that.isValid()) {
                return NaN;
            }

            zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

            units = normalizeUnits(units);

            switch (units) {
                case 'year':
                    output = monthDiff(this, that) / 12;
                    break;
                case 'month':
                    output = monthDiff(this, that);
                    break;
                case 'quarter':
                    output = monthDiff(this, that) / 3;
                    break;
                case 'second':
                    output = (this - that) / 1e3;
                    break; // 1000
                case 'minute':
                    output = (this - that) / 6e4;
                    break; // 1000 * 60
                case 'hour':
                    output = (this - that) / 36e5;
                    break; // 1000 * 60 * 60
                case 'day':
                    output = (this - that - zoneDelta) / 864e5;
                    break; // 1000 * 60 * 60 * 24, negate dst
                case 'week':
                    output = (this - that - zoneDelta) / 6048e5;
                    break; // 1000 * 60 * 60 * 24 * 7, negate dst
                default:
                    output = this - that;
            }

            return asFloat ? output : absFloor(output);
        }

        function monthDiff(a, b) {
            if (a.date() < b.date()) {
                // end-of-month calculations work correct when the start month has more
                // days than the end month.
                return -monthDiff(b, a);
            }
            // difference in months
            var wholeMonthDiff = (b.year() - a.year()) * 12 + (b.month() - a.month()),
                // b is in (anchor - 1 month, anchor + 1 month)
                anchor = a.clone().add(wholeMonthDiff, 'months'),
                anchor2,
                adjust;

            if (b - anchor < 0) {
                anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
                // linear across the month
                adjust = (b - anchor) / (anchor - anchor2);
            } else {
                anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
                // linear across the month
                adjust = (b - anchor) / (anchor2 - anchor);
            }

            //check for negative zero, return zero if negative zero
            return -(wholeMonthDiff + adjust) || 0;
        }

        hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';
        hooks.defaultFormatUtc = 'YYYY-MM-DDTHH:mm:ss[Z]';

        function toString() {
            return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
        }

        function toISOString(keepOffset) {
            if (!this.isValid()) {
                return null;
            }
            var utc = keepOffset !== true,
                m = utc ? this.clone().utc() : this;
            if (m.year() < 0 || m.year() > 9999) {
                return formatMoment(
                    m,
                    utc
                        ? 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]'
                        : 'YYYYYY-MM-DD[T]HH:mm:ss.SSSZ'
                );
            }
            if (isFunction(Date.prototype.toISOString)) {
                // native implementation is ~50x faster, use it when we can
                if (utc) {
                    return this.toDate().toISOString();
                } else {
                    return new Date(this.valueOf() + this.utcOffset() * 60 * 1000)
                        .toISOString()
                        .replace('Z', formatMoment(m, 'Z'));
                }
            }
            return formatMoment(
                m,
                utc ? 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYY-MM-DD[T]HH:mm:ss.SSSZ'
            );
        }

        /**
         * Return a human readable representation of a moment that can
         * also be evaluated to get a new moment which is the same
         *
         * @link https://nodejs.org/dist/latest/docs/api/util.html#util_custom_inspect_function_on_objects
         */
        function inspect() {
            if (!this.isValid()) {
                return 'moment.invalid(/* ' + this._i + ' */)';
            }
            var func = 'moment',
                zone = '',
                prefix,
                year,
                datetime,
                suffix;
            if (!this.isLocal()) {
                func = this.utcOffset() === 0 ? 'moment.utc' : 'moment.parseZone';
                zone = 'Z';
            }
            prefix = '[' + func + '("]';
            year = 0 <= this.year() && this.year() <= 9999 ? 'YYYY' : 'YYYYYY';
            datetime = '-MM-DD[T]HH:mm:ss.SSS';
            suffix = zone + '[")]';

            return this.format(prefix + year + datetime + suffix);
        }

        function format(inputString) {
            if (!inputString) {
                inputString = this.isUtc()
                    ? hooks.defaultFormatUtc
                    : hooks.defaultFormat;
            }
            var output = formatMoment(this, inputString);
            return this.localeData().postformat(output);
        }

        function from(time, withoutSuffix) {
            if (
                this.isValid() &&
                ((isMoment(time) && time.isValid()) || createLocal(time).isValid())
            ) {
                return createDuration({ to: this, from: time })
                    .locale(this.locale())
                    .humanize(!withoutSuffix);
            } else {
                return this.localeData().invalidDate();
            }
        }

        function fromNow(withoutSuffix) {
            return this.from(createLocal(), withoutSuffix);
        }

        function to(time, withoutSuffix) {
            if (
                this.isValid() &&
                ((isMoment(time) && time.isValid()) || createLocal(time).isValid())
            ) {
                return createDuration({ from: this, to: time })
                    .locale(this.locale())
                    .humanize(!withoutSuffix);
            } else {
                return this.localeData().invalidDate();
            }
        }

        function toNow(withoutSuffix) {
            return this.to(createLocal(), withoutSuffix);
        }

        // If passed a locale key, it will set the locale for this
        // instance.  Otherwise, it will return the locale configuration
        // variables for this instance.
        function locale(key) {
            var newLocaleData;

            if (key === undefined) {
                return this._locale._abbr;
            } else {
                newLocaleData = getLocale(key);
                if (newLocaleData != null) {
                    this._locale = newLocaleData;
                }
                return this;
            }
        }

        var lang = deprecate(
            'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
            function (key) {
                if (key === undefined) {
                    return this.localeData();
                } else {
                    return this.locale(key);
                }
            }
        );

        function localeData() {
            return this._locale;
        }

        var MS_PER_SECOND = 1000,
            MS_PER_MINUTE = 60 * MS_PER_SECOND,
            MS_PER_HOUR = 60 * MS_PER_MINUTE,
            MS_PER_400_YEARS = (365 * 400 + 97) * 24 * MS_PER_HOUR;

        // actual modulo - handles negative numbers (for dates before 1970):
        function mod$1(dividend, divisor) {
            return ((dividend % divisor) + divisor) % divisor;
        }

        function localStartOfDate(y, m, d) {
            // the date constructor remaps years 0-99 to 1900-1999
            if (y < 100 && y >= 0) {
                // preserve leap years using a full 400 year cycle, then reset
                return new Date(y + 400, m, d) - MS_PER_400_YEARS;
            } else {
                return new Date(y, m, d).valueOf();
            }
        }

        function utcStartOfDate(y, m, d) {
            // Date.UTC remaps years 0-99 to 1900-1999
            if (y < 100 && y >= 0) {
                // preserve leap years using a full 400 year cycle, then reset
                return Date.UTC(y + 400, m, d) - MS_PER_400_YEARS;
            } else {
                return Date.UTC(y, m, d);
            }
        }

        function startOf(units) {
            var time, startOfDate;
            units = normalizeUnits(units);
            if (units === undefined || units === 'millisecond' || !this.isValid()) {
                return this;
            }

            startOfDate = this._isUTC ? utcStartOfDate : localStartOfDate;

            switch (units) {
                case 'year':
                    time = startOfDate(this.year(), 0, 1);
                    break;
                case 'quarter':
                    time = startOfDate(
                        this.year(),
                        this.month() - (this.month() % 3),
                        1
                    );
                    break;
                case 'month':
                    time = startOfDate(this.year(), this.month(), 1);
                    break;
                case 'week':
                    time = startOfDate(
                        this.year(),
                        this.month(),
                        this.date() - this.weekday()
                    );
                    break;
                case 'isoWeek':
                    time = startOfDate(
                        this.year(),
                        this.month(),
                        this.date() - (this.isoWeekday() - 1)
                    );
                    break;
                case 'day':
                case 'date':
                    time = startOfDate(this.year(), this.month(), this.date());
                    break;
                case 'hour':
                    time = this._d.valueOf();
                    time -= mod$1(
                        time + (this._isUTC ? 0 : this.utcOffset() * MS_PER_MINUTE),
                        MS_PER_HOUR
                    );
                    break;
                case 'minute':
                    time = this._d.valueOf();
                    time -= mod$1(time, MS_PER_MINUTE);
                    break;
                case 'second':
                    time = this._d.valueOf();
                    time -= mod$1(time, MS_PER_SECOND);
                    break;
            }

            this._d.setTime(time);
            hooks.updateOffset(this, true);
            return this;
        }

        function endOf(units) {
            var time, startOfDate;
            units = normalizeUnits(units);
            if (units === undefined || units === 'millisecond' || !this.isValid()) {
                return this;
            }

            startOfDate = this._isUTC ? utcStartOfDate : localStartOfDate;

            switch (units) {
                case 'year':
                    time = startOfDate(this.year() + 1, 0, 1) - 1;
                    break;
                case 'quarter':
                    time =
                        startOfDate(
                            this.year(),
                            this.month() - (this.month() % 3) + 3,
                            1
                        ) - 1;
                    break;
                case 'month':
                    time = startOfDate(this.year(), this.month() + 1, 1) - 1;
                    break;
                case 'week':
                    time =
                        startOfDate(
                            this.year(),
                            this.month(),
                            this.date() - this.weekday() + 7
                        ) - 1;
                    break;
                case 'isoWeek':
                    time =
                        startOfDate(
                            this.year(),
                            this.month(),
                            this.date() - (this.isoWeekday() - 1) + 7
                        ) - 1;
                    break;
                case 'day':
                case 'date':
                    time = startOfDate(this.year(), this.month(), this.date() + 1) - 1;
                    break;
                case 'hour':
                    time = this._d.valueOf();
                    time +=
                        MS_PER_HOUR -
                        mod$1(
                            time + (this._isUTC ? 0 : this.utcOffset() * MS_PER_MINUTE),
                            MS_PER_HOUR
                        ) -
                        1;
                    break;
                case 'minute':
                    time = this._d.valueOf();
                    time += MS_PER_MINUTE - mod$1(time, MS_PER_MINUTE) - 1;
                    break;
                case 'second':
                    time = this._d.valueOf();
                    time += MS_PER_SECOND - mod$1(time, MS_PER_SECOND) - 1;
                    break;
            }

            this._d.setTime(time);
            hooks.updateOffset(this, true);
            return this;
        }

        function valueOf() {
            return this._d.valueOf() - (this._offset || 0) * 60000;
        }

        function unix() {
            return Math.floor(this.valueOf() / 1000);
        }

        function toDate() {
            return new Date(this.valueOf());
        }

        function toArray() {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hour(),
                m.minute(),
                m.second(),
                m.millisecond(),
            ];
        }

        function toObject() {
            var m = this;
            return {
                years: m.year(),
                months: m.month(),
                date: m.date(),
                hours: m.hours(),
                minutes: m.minutes(),
                seconds: m.seconds(),
                milliseconds: m.milliseconds(),
            };
        }

        function toJSON() {
            // new Date(NaN).toJSON() === null
            return this.isValid() ? this.toISOString() : null;
        }

        function isValid$2() {
            return isValid(this);
        }

        function parsingFlags() {
            return extend({}, getParsingFlags(this));
        }

        function invalidAt() {
            return getParsingFlags(this).overflow;
        }

        function creationData() {
            return {
                input: this._i,
                format: this._f,
                locale: this._locale,
                isUTC: this._isUTC,
                strict: this._strict,
            };
        }

        addFormatToken('N', 0, 0, 'eraAbbr');
        addFormatToken('NN', 0, 0, 'eraAbbr');
        addFormatToken('NNN', 0, 0, 'eraAbbr');
        addFormatToken('NNNN', 0, 0, 'eraName');
        addFormatToken('NNNNN', 0, 0, 'eraNarrow');

        addFormatToken('y', ['y', 1], 'yo', 'eraYear');
        addFormatToken('y', ['yy', 2], 0, 'eraYear');
        addFormatToken('y', ['yyy', 3], 0, 'eraYear');
        addFormatToken('y', ['yyyy', 4], 0, 'eraYear');

        addRegexToken('N', matchEraAbbr);
        addRegexToken('NN', matchEraAbbr);
        addRegexToken('NNN', matchEraAbbr);
        addRegexToken('NNNN', matchEraName);
        addRegexToken('NNNNN', matchEraNarrow);

        addParseToken(
            ['N', 'NN', 'NNN', 'NNNN', 'NNNNN'],
            function (input, array, config, token) {
                var era = config._locale.erasParse(input, token, config._strict);
                if (era) {
                    getParsingFlags(config).era = era;
                } else {
                    getParsingFlags(config).invalidEra = input;
                }
            }
        );

        addRegexToken('y', matchUnsigned);
        addRegexToken('yy', matchUnsigned);
        addRegexToken('yyy', matchUnsigned);
        addRegexToken('yyyy', matchUnsigned);
        addRegexToken('yo', matchEraYearOrdinal);

        addParseToken(['y', 'yy', 'yyy', 'yyyy'], YEAR);
        addParseToken(['yo'], function (input, array, config, token) {
            var match;
            if (config._locale._eraYearOrdinalRegex) {
                match = input.match(config._locale._eraYearOrdinalRegex);
            }

            if (config._locale.eraYearOrdinalParse) {
                array[YEAR] = config._locale.eraYearOrdinalParse(input, match);
            } else {
                array[YEAR] = parseInt(input, 10);
            }
        });

        function localeEras(m, format) {
            var i,
                l,
                date,
                eras = this._eras || getLocale('en')._eras;
            for (i = 0, l = eras.length; i < l; ++i) {
                switch (typeof eras[i].since) {
                    case 'string':
                        // truncate time
                        date = hooks(eras[i].since).startOf('day');
                        eras[i].since = date.valueOf();
                        break;
                }

                switch (typeof eras[i].until) {
                    case 'undefined':
                        eras[i].until = +Infinity;
                        break;
                    case 'string':
                        // truncate time
                        date = hooks(eras[i].until).startOf('day').valueOf();
                        eras[i].until = date.valueOf();
                        break;
                }
            }
            return eras;
        }

        function localeErasParse(eraName, format, strict) {
            var i,
                l,
                eras = this.eras(),
                name,
                abbr,
                narrow;
            eraName = eraName.toUpperCase();

            for (i = 0, l = eras.length; i < l; ++i) {
                name = eras[i].name.toUpperCase();
                abbr = eras[i].abbr.toUpperCase();
                narrow = eras[i].narrow.toUpperCase();

                if (strict) {
                    switch (format) {
                        case 'N':
                        case 'NN':
                        case 'NNN':
                            if (abbr === eraName) {
                                return eras[i];
                            }
                            break;

                        case 'NNNN':
                            if (name === eraName) {
                                return eras[i];
                            }
                            break;

                        case 'NNNNN':
                            if (narrow === eraName) {
                                return eras[i];
                            }
                            break;
                    }
                } else if ([name, abbr, narrow].indexOf(eraName) >= 0) {
                    return eras[i];
                }
            }
        }

        function localeErasConvertYear(era, year) {
            var dir = era.since <= era.until ? +1 : -1;
            if (year === undefined) {
                return hooks(era.since).year();
            } else {
                return hooks(era.since).year() + (year - era.offset) * dir;
            }
        }

        function getEraName() {
            var i,
                l,
                val,
                eras = this.localeData().eras();
            for (i = 0, l = eras.length; i < l; ++i) {
                // truncate time
                val = this.clone().startOf('day').valueOf();

                if (eras[i].since <= val && val <= eras[i].until) {
                    return eras[i].name;
                }
                if (eras[i].until <= val && val <= eras[i].since) {
                    return eras[i].name;
                }
            }

            return '';
        }

        function getEraNarrow() {
            var i,
                l,
                val,
                eras = this.localeData().eras();
            for (i = 0, l = eras.length; i < l; ++i) {
                // truncate time
                val = this.clone().startOf('day').valueOf();

                if (eras[i].since <= val && val <= eras[i].until) {
                    return eras[i].narrow;
                }
                if (eras[i].until <= val && val <= eras[i].since) {
                    return eras[i].narrow;
                }
            }

            return '';
        }

        function getEraAbbr() {
            var i,
                l,
                val,
                eras = this.localeData().eras();
            for (i = 0, l = eras.length; i < l; ++i) {
                // truncate time
                val = this.clone().startOf('day').valueOf();

                if (eras[i].since <= val && val <= eras[i].until) {
                    return eras[i].abbr;
                }
                if (eras[i].until <= val && val <= eras[i].since) {
                    return eras[i].abbr;
                }
            }

            return '';
        }

        function getEraYear() {
            var i,
                l,
                dir,
                val,
                eras = this.localeData().eras();
            for (i = 0, l = eras.length; i < l; ++i) {
                dir = eras[i].since <= eras[i].until ? +1 : -1;

                // truncate time
                val = this.clone().startOf('day').valueOf();

                if (
                    (eras[i].since <= val && val <= eras[i].until) ||
                    (eras[i].until <= val && val <= eras[i].since)
                ) {
                    return (
                        (this.year() - hooks(eras[i].since).year()) * dir +
                        eras[i].offset
                    );
                }
            }

            return this.year();
        }

        function erasNameRegex(isStrict) {
            if (!hasOwnProp(this, '_erasNameRegex')) {
                computeErasParse.call(this);
            }
            return isStrict ? this._erasNameRegex : this._erasRegex;
        }

        function erasAbbrRegex(isStrict) {
            if (!hasOwnProp(this, '_erasAbbrRegex')) {
                computeErasParse.call(this);
            }
            return isStrict ? this._erasAbbrRegex : this._erasRegex;
        }

        function erasNarrowRegex(isStrict) {
            if (!hasOwnProp(this, '_erasNarrowRegex')) {
                computeErasParse.call(this);
            }
            return isStrict ? this._erasNarrowRegex : this._erasRegex;
        }

        function matchEraAbbr(isStrict, locale) {
            return locale.erasAbbrRegex(isStrict);
        }

        function matchEraName(isStrict, locale) {
            return locale.erasNameRegex(isStrict);
        }

        function matchEraNarrow(isStrict, locale) {
            return locale.erasNarrowRegex(isStrict);
        }

        function matchEraYearOrdinal(isStrict, locale) {
            return locale._eraYearOrdinalRegex || matchUnsigned;
        }

        function computeErasParse() {
            var abbrPieces = [],
                namePieces = [],
                narrowPieces = [],
                mixedPieces = [],
                i,
                l,
                eras = this.eras();

            for (i = 0, l = eras.length; i < l; ++i) {
                namePieces.push(regexEscape(eras[i].name));
                abbrPieces.push(regexEscape(eras[i].abbr));
                narrowPieces.push(regexEscape(eras[i].narrow));

                mixedPieces.push(regexEscape(eras[i].name));
                mixedPieces.push(regexEscape(eras[i].abbr));
                mixedPieces.push(regexEscape(eras[i].narrow));
            }

            this._erasRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
            this._erasNameRegex = new RegExp('^(' + namePieces.join('|') + ')', 'i');
            this._erasAbbrRegex = new RegExp('^(' + abbrPieces.join('|') + ')', 'i');
            this._erasNarrowRegex = new RegExp(
                '^(' + narrowPieces.join('|') + ')',
                'i'
            );
        }

        // FORMATTING

        addFormatToken(0, ['gg', 2], 0, function () {
            return this.weekYear() % 100;
        });

        addFormatToken(0, ['GG', 2], 0, function () {
            return this.isoWeekYear() % 100;
        });

        function addWeekYearFormatToken(token, getter) {
            addFormatToken(0, [token, token.length], 0, getter);
        }

        addWeekYearFormatToken('gggg', 'weekYear');
        addWeekYearFormatToken('ggggg', 'weekYear');
        addWeekYearFormatToken('GGGG', 'isoWeekYear');
        addWeekYearFormatToken('GGGGG', 'isoWeekYear');

        // ALIASES

        addUnitAlias('weekYear', 'gg');
        addUnitAlias('isoWeekYear', 'GG');

        // PRIORITY

        addUnitPriority('weekYear', 1);
        addUnitPriority('isoWeekYear', 1);

        // PARSING

        addRegexToken('G', matchSigned);
        addRegexToken('g', matchSigned);
        addRegexToken('GG', match1to2, match2);
        addRegexToken('gg', match1to2, match2);
        addRegexToken('GGGG', match1to4, match4);
        addRegexToken('gggg', match1to4, match4);
        addRegexToken('GGGGG', match1to6, match6);
        addRegexToken('ggggg', match1to6, match6);

        addWeekParseToken(
            ['gggg', 'ggggg', 'GGGG', 'GGGGG'],
            function (input, week, config, token) {
                week[token.substr(0, 2)] = toInt(input);
            }
        );

        addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
            week[token] = hooks.parseTwoDigitYear(input);
        });

        // MOMENTS

        function getSetWeekYear(input) {
            return getSetWeekYearHelper.call(
                this,
                input,
                this.week(),
                this.weekday(),
                this.localeData()._week.dow,
                this.localeData()._week.doy
            );
        }

        function getSetISOWeekYear(input) {
            return getSetWeekYearHelper.call(
                this,
                input,
                this.isoWeek(),
                this.isoWeekday(),
                1,
                4
            );
        }

        function getISOWeeksInYear() {
            return weeksInYear(this.year(), 1, 4);
        }

        function getISOWeeksInISOWeekYear() {
            return weeksInYear(this.isoWeekYear(), 1, 4);
        }

        function getWeeksInYear() {
            var weekInfo = this.localeData()._week;
            return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        }

        function getWeeksInWeekYear() {
            var weekInfo = this.localeData()._week;
            return weeksInYear(this.weekYear(), weekInfo.dow, weekInfo.doy);
        }

        function getSetWeekYearHelper(input, week, weekday, dow, doy) {
            var weeksTarget;
            if (input == null) {
                return weekOfYear(this, dow, doy).year;
            } else {
                weeksTarget = weeksInYear(input, dow, doy);
                if (week > weeksTarget) {
                    week = weeksTarget;
                }
                return setWeekAll.call(this, input, week, weekday, dow, doy);
            }
        }

        function setWeekAll(weekYear, week, weekday, dow, doy) {
            var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
                date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

            this.year(date.getUTCFullYear());
            this.month(date.getUTCMonth());
            this.date(date.getUTCDate());
            return this;
        }

        // FORMATTING

        addFormatToken('Q', 0, 'Qo', 'quarter');

        // ALIASES

        addUnitAlias('quarter', 'Q');

        // PRIORITY

        addUnitPriority('quarter', 7);

        // PARSING

        addRegexToken('Q', match1);
        addParseToken('Q', function (input, array) {
            array[MONTH] = (toInt(input) - 1) * 3;
        });

        // MOMENTS

        function getSetQuarter(input) {
            return input == null
                ? Math.ceil((this.month() + 1) / 3)
                : this.month((input - 1) * 3 + (this.month() % 3));
        }

        // FORMATTING

        addFormatToken('D', ['DD', 2], 'Do', 'date');

        // ALIASES

        addUnitAlias('date', 'D');

        // PRIORITY
        addUnitPriority('date', 9);

        // PARSING

        addRegexToken('D', match1to2);
        addRegexToken('DD', match1to2, match2);
        addRegexToken('Do', function (isStrict, locale) {
            // TODO: Remove "ordinalParse" fallback in next major release.
            return isStrict
                ? locale._dayOfMonthOrdinalParse || locale._ordinalParse
                : locale._dayOfMonthOrdinalParseLenient;
        });

        addParseToken(['D', 'DD'], DATE);
        addParseToken('Do', function (input, array) {
            array[DATE] = toInt(input.match(match1to2)[0]);
        });

        // MOMENTS

        var getSetDayOfMonth = makeGetSet('Date', true);

        // FORMATTING

        addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

        // ALIASES

        addUnitAlias('dayOfYear', 'DDD');

        // PRIORITY
        addUnitPriority('dayOfYear', 4);

        // PARSING

        addRegexToken('DDD', match1to3);
        addRegexToken('DDDD', match3);
        addParseToken(['DDD', 'DDDD'], function (input, array, config) {
            config._dayOfYear = toInt(input);
        });

        // HELPERS

        // MOMENTS

        function getSetDayOfYear(input) {
            var dayOfYear =
                Math.round(
                    (this.clone().startOf('day') - this.clone().startOf('year')) / 864e5
                ) + 1;
            return input == null ? dayOfYear : this.add(input - dayOfYear, 'd');
        }

        // FORMATTING

        addFormatToken('m', ['mm', 2], 0, 'minute');

        // ALIASES

        addUnitAlias('minute', 'm');

        // PRIORITY

        addUnitPriority('minute', 14);

        // PARSING

        addRegexToken('m', match1to2);
        addRegexToken('mm', match1to2, match2);
        addParseToken(['m', 'mm'], MINUTE);

        // MOMENTS

        var getSetMinute = makeGetSet('Minutes', false);

        // FORMATTING

        addFormatToken('s', ['ss', 2], 0, 'second');

        // ALIASES

        addUnitAlias('second', 's');

        // PRIORITY

        addUnitPriority('second', 15);

        // PARSING

        addRegexToken('s', match1to2);
        addRegexToken('ss', match1to2, match2);
        addParseToken(['s', 'ss'], SECOND);

        // MOMENTS

        var getSetSecond = makeGetSet('Seconds', false);

        // FORMATTING

        addFormatToken('S', 0, 0, function () {
            return ~~(this.millisecond() / 100);
        });

        addFormatToken(0, ['SS', 2], 0, function () {
            return ~~(this.millisecond() / 10);
        });

        addFormatToken(0, ['SSS', 3], 0, 'millisecond');
        addFormatToken(0, ['SSSS', 4], 0, function () {
            return this.millisecond() * 10;
        });
        addFormatToken(0, ['SSSSS', 5], 0, function () {
            return this.millisecond() * 100;
        });
        addFormatToken(0, ['SSSSSS', 6], 0, function () {
            return this.millisecond() * 1000;
        });
        addFormatToken(0, ['SSSSSSS', 7], 0, function () {
            return this.millisecond() * 10000;
        });
        addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
            return this.millisecond() * 100000;
        });
        addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
            return this.millisecond() * 1000000;
        });

        // ALIASES

        addUnitAlias('millisecond', 'ms');

        // PRIORITY

        addUnitPriority('millisecond', 16);

        // PARSING

        addRegexToken('S', match1to3, match1);
        addRegexToken('SS', match1to3, match2);
        addRegexToken('SSS', match1to3, match3);

        var token, getSetMillisecond;
        for (token = 'SSSS'; token.length <= 9; token += 'S') {
            addRegexToken(token, matchUnsigned);
        }

        function parseMs(input, array) {
            array[MILLISECOND] = toInt(('0.' + input) * 1000);
        }

        for (token = 'S'; token.length <= 9; token += 'S') {
            addParseToken(token, parseMs);
        }

        getSetMillisecond = makeGetSet('Milliseconds', false);

        // FORMATTING

        addFormatToken('z', 0, 0, 'zoneAbbr');
        addFormatToken('zz', 0, 0, 'zoneName');

        // MOMENTS

        function getZoneAbbr() {
            return this._isUTC ? 'UTC' : '';
        }

        function getZoneName() {
            return this._isUTC ? 'Coordinated Universal Time' : '';
        }

        var proto = Moment.prototype;

        proto.add = add;
        proto.calendar = calendar$1;
        proto.clone = clone;
        proto.diff = diff;
        proto.endOf = endOf;
        proto.format = format;
        proto.from = from;
        proto.fromNow = fromNow;
        proto.to = to;
        proto.toNow = toNow;
        proto.get = stringGet;
        proto.invalidAt = invalidAt;
        proto.isAfter = isAfter;
        proto.isBefore = isBefore;
        proto.isBetween = isBetween;
        proto.isSame = isSame;
        proto.isSameOrAfter = isSameOrAfter;
        proto.isSameOrBefore = isSameOrBefore;
        proto.isValid = isValid$2;
        proto.lang = lang;
        proto.locale = locale;
        proto.localeData = localeData;
        proto.max = prototypeMax;
        proto.min = prototypeMin;
        proto.parsingFlags = parsingFlags;
        proto.set = stringSet;
        proto.startOf = startOf;
        proto.subtract = subtract;
        proto.toArray = toArray;
        proto.toObject = toObject;
        proto.toDate = toDate;
        proto.toISOString = toISOString;
        proto.inspect = inspect;
        if (typeof Symbol !== 'undefined' && Symbol.for != null) {
            proto[Symbol.for('nodejs.util.inspect.custom')] = function () {
                return 'Moment<' + this.format() + '>';
            };
        }
        proto.toJSON = toJSON;
        proto.toString = toString;
        proto.unix = unix;
        proto.valueOf = valueOf;
        proto.creationData = creationData;
        proto.eraName = getEraName;
        proto.eraNarrow = getEraNarrow;
        proto.eraAbbr = getEraAbbr;
        proto.eraYear = getEraYear;
        proto.year = getSetYear;
        proto.isLeapYear = getIsLeapYear;
        proto.weekYear = getSetWeekYear;
        proto.isoWeekYear = getSetISOWeekYear;
        proto.quarter = proto.quarters = getSetQuarter;
        proto.month = getSetMonth;
        proto.daysInMonth = getDaysInMonth;
        proto.week = proto.weeks = getSetWeek;
        proto.isoWeek = proto.isoWeeks = getSetISOWeek;
        proto.weeksInYear = getWeeksInYear;
        proto.weeksInWeekYear = getWeeksInWeekYear;
        proto.isoWeeksInYear = getISOWeeksInYear;
        proto.isoWeeksInISOWeekYear = getISOWeeksInISOWeekYear;
        proto.date = getSetDayOfMonth;
        proto.day = proto.days = getSetDayOfWeek;
        proto.weekday = getSetLocaleDayOfWeek;
        proto.isoWeekday = getSetISODayOfWeek;
        proto.dayOfYear = getSetDayOfYear;
        proto.hour = proto.hours = getSetHour;
        proto.minute = proto.minutes = getSetMinute;
        proto.second = proto.seconds = getSetSecond;
        proto.millisecond = proto.milliseconds = getSetMillisecond;
        proto.utcOffset = getSetOffset;
        proto.utc = setOffsetToUTC;
        proto.local = setOffsetToLocal;
        proto.parseZone = setOffsetToParsedOffset;
        proto.hasAlignedHourOffset = hasAlignedHourOffset;
        proto.isDST = isDaylightSavingTime;
        proto.isLocal = isLocal;
        proto.isUtcOffset = isUtcOffset;
        proto.isUtc = isUtc;
        proto.isUTC = isUtc;
        proto.zoneAbbr = getZoneAbbr;
        proto.zoneName = getZoneName;
        proto.dates = deprecate(
            'dates accessor is deprecated. Use date instead.',
            getSetDayOfMonth
        );
        proto.months = deprecate(
            'months accessor is deprecated. Use month instead',
            getSetMonth
        );
        proto.years = deprecate(
            'years accessor is deprecated. Use year instead',
            getSetYear
        );
        proto.zone = deprecate(
            'moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/',
            getSetZone
        );
        proto.isDSTShifted = deprecate(
            'isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information',
            isDaylightSavingTimeShifted
        );

        function createUnix(input) {
            return createLocal(input * 1000);
        }

        function createInZone() {
            return createLocal.apply(null, arguments).parseZone();
        }

        function preParsePostFormat(string) {
            return string;
        }

        var proto$1 = Locale.prototype;

        proto$1.calendar = calendar;
        proto$1.longDateFormat = longDateFormat;
        proto$1.invalidDate = invalidDate;
        proto$1.ordinal = ordinal;
        proto$1.preparse = preParsePostFormat;
        proto$1.postformat = preParsePostFormat;
        proto$1.relativeTime = relativeTime;
        proto$1.pastFuture = pastFuture;
        proto$1.set = set;
        proto$1.eras = localeEras;
        proto$1.erasParse = localeErasParse;
        proto$1.erasConvertYear = localeErasConvertYear;
        proto$1.erasAbbrRegex = erasAbbrRegex;
        proto$1.erasNameRegex = erasNameRegex;
        proto$1.erasNarrowRegex = erasNarrowRegex;

        proto$1.months = localeMonths;
        proto$1.monthsShort = localeMonthsShort;
        proto$1.monthsParse = localeMonthsParse;
        proto$1.monthsRegex = monthsRegex;
        proto$1.monthsShortRegex = monthsShortRegex;
        proto$1.week = localeWeek;
        proto$1.firstDayOfYear = localeFirstDayOfYear;
        proto$1.firstDayOfWeek = localeFirstDayOfWeek;

        proto$1.weekdays = localeWeekdays;
        proto$1.weekdaysMin = localeWeekdaysMin;
        proto$1.weekdaysShort = localeWeekdaysShort;
        proto$1.weekdaysParse = localeWeekdaysParse;

        proto$1.weekdaysRegex = weekdaysRegex;
        proto$1.weekdaysShortRegex = weekdaysShortRegex;
        proto$1.weekdaysMinRegex = weekdaysMinRegex;

        proto$1.isPM = localeIsPM;
        proto$1.meridiem = localeMeridiem;

        function get$1(format, index, field, setter) {
            var locale = getLocale(),
                utc = createUTC().set(setter, index);
            return locale[field](utc, format);
        }

        function listMonthsImpl(format, index, field) {
            if (isNumber(format)) {
                index = format;
                format = undefined;
            }

            format = format || '';

            if (index != null) {
                return get$1(format, index, field, 'month');
            }

            var i,
                out = [];
            for (i = 0; i < 12; i++) {
                out[i] = get$1(format, i, field, 'month');
            }
            return out;
        }

        // ()
        // (5)
        // (fmt, 5)
        // (fmt)
        // (true)
        // (true, 5)
        // (true, fmt, 5)
        // (true, fmt)
        function listWeekdaysImpl(localeSorted, format, index, field) {
            if (typeof localeSorted === 'boolean') {
                if (isNumber(format)) {
                    index = format;
                    format = undefined;
                }

                format = format || '';
            } else {
                format = localeSorted;
                index = format;
                localeSorted = false;

                if (isNumber(format)) {
                    index = format;
                    format = undefined;
                }

                format = format || '';
            }

            var locale = getLocale(),
                shift = localeSorted ? locale._week.dow : 0,
                i,
                out = [];

            if (index != null) {
                return get$1(format, (index + shift) % 7, field, 'day');
            }

            for (i = 0; i < 7; i++) {
                out[i] = get$1(format, (i + shift) % 7, field, 'day');
            }
            return out;
        }

        function listMonths(format, index) {
            return listMonthsImpl(format, index, 'months');
        }

        function listMonthsShort(format, index) {
            return listMonthsImpl(format, index, 'monthsShort');
        }

        function listWeekdays(localeSorted, format, index) {
            return listWeekdaysImpl(localeSorted, format, index, 'weekdays');
        }

        function listWeekdaysShort(localeSorted, format, index) {
            return listWeekdaysImpl(localeSorted, format, index, 'weekdaysShort');
        }

        function listWeekdaysMin(localeSorted, format, index) {
            return listWeekdaysImpl(localeSorted, format, index, 'weekdaysMin');
        }

        getSetGlobalLocale('en', {
            eras: [
                {
                    since: '0001-01-01',
                    until: +Infinity,
                    offset: 1,
                    name: 'Anno Domini',
                    narrow: 'AD',
                    abbr: 'AD',
                },
                {
                    since: '0000-12-31',
                    until: -Infinity,
                    offset: 1,
                    name: 'Before Christ',
                    narrow: 'BC',
                    abbr: 'BC',
                },
            ],
            dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
            ordinal: function (number) {
                var b = number % 10,
                    output =
                        toInt((number % 100) / 10) === 1
                            ? 'th'
                            : b === 1
                            ? 'st'
                            : b === 2
                            ? 'nd'
                            : b === 3
                            ? 'rd'
                            : 'th';
                return number + output;
            },
        });

        // Side effect imports

        hooks.lang = deprecate(
            'moment.lang is deprecated. Use moment.locale instead.',
            getSetGlobalLocale
        );
        hooks.langData = deprecate(
            'moment.langData is deprecated. Use moment.localeData instead.',
            getLocale
        );

        var mathAbs = Math.abs;

        function abs() {
            var data = this._data;

            this._milliseconds = mathAbs(this._milliseconds);
            this._days = mathAbs(this._days);
            this._months = mathAbs(this._months);

            data.milliseconds = mathAbs(data.milliseconds);
            data.seconds = mathAbs(data.seconds);
            data.minutes = mathAbs(data.minutes);
            data.hours = mathAbs(data.hours);
            data.months = mathAbs(data.months);
            data.years = mathAbs(data.years);

            return this;
        }

        function addSubtract$1(duration, input, value, direction) {
            var other = createDuration(input, value);

            duration._milliseconds += direction * other._milliseconds;
            duration._days += direction * other._days;
            duration._months += direction * other._months;

            return duration._bubble();
        }

        // supports only 2.0-style add(1, 's') or add(duration)
        function add$1(input, value) {
            return addSubtract$1(this, input, value, 1);
        }

        // supports only 2.0-style subtract(1, 's') or subtract(duration)
        function subtract$1(input, value) {
            return addSubtract$1(this, input, value, -1);
        }

        function absCeil(number) {
            if (number < 0) {
                return Math.floor(number);
            } else {
                return Math.ceil(number);
            }
        }

        function bubble() {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds,
                minutes,
                hours,
                years,
                monthsFromDays;

            // if we have a mix of positive and negative values, bubble down first
            // check: https://github.com/moment/moment/issues/2166
            if (
                !(
                    (milliseconds >= 0 && days >= 0 && months >= 0) ||
                    (milliseconds <= 0 && days <= 0 && months <= 0)
                )
            ) {
                milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
                days = 0;
                months = 0;
            }

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absFloor(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absFloor(seconds / 60);
            data.minutes = minutes % 60;

            hours = absFloor(minutes / 60);
            data.hours = hours % 24;

            days += absFloor(hours / 24);

            // convert days to months
            monthsFromDays = absFloor(daysToMonths(days));
            months += monthsFromDays;
            days -= absCeil(monthsToDays(monthsFromDays));

            // 12 months -> 1 year
            years = absFloor(months / 12);
            months %= 12;

            data.days = days;
            data.months = months;
            data.years = years;

            return this;
        }

        function daysToMonths(days) {
            // 400 years have 146097 days (taking into account leap year rules)
            // 400 years have 12 months === 4800
            return (days * 4800) / 146097;
        }

        function monthsToDays(months) {
            // the reverse of daysToMonths
            return (months * 146097) / 4800;
        }

        function as(units) {
            if (!this.isValid()) {
                return NaN;
            }
            var days,
                months,
                milliseconds = this._milliseconds;

            units = normalizeUnits(units);

            if (units === 'month' || units === 'quarter' || units === 'year') {
                days = this._days + milliseconds / 864e5;
                months = this._months + daysToMonths(days);
                switch (units) {
                    case 'month':
                        return months;
                    case 'quarter':
                        return months / 3;
                    case 'year':
                        return months / 12;
                }
            } else {
                // handle milliseconds separately because of floating point math errors (issue #1867)
                days = this._days + Math.round(monthsToDays(this._months));
                switch (units) {
                    case 'week':
                        return days / 7 + milliseconds / 6048e5;
                    case 'day':
                        return days + milliseconds / 864e5;
                    case 'hour':
                        return days * 24 + milliseconds / 36e5;
                    case 'minute':
                        return days * 1440 + milliseconds / 6e4;
                    case 'second':
                        return days * 86400 + milliseconds / 1000;
                    // Math.floor prevents floating point math errors here
                    case 'millisecond':
                        return Math.floor(days * 864e5) + milliseconds;
                    default:
                        throw new Error('Unknown unit ' + units);
                }
            }
        }

        // TODO: Use this.as('ms')?
        function valueOf$1() {
            if (!this.isValid()) {
                return NaN;
            }
            return (
                this._milliseconds +
                this._days * 864e5 +
                (this._months % 12) * 2592e6 +
                toInt(this._months / 12) * 31536e6
            );
        }

        function makeAs(alias) {
            return function () {
                return this.as(alias);
            };
        }

        var asMilliseconds = makeAs('ms'),
            asSeconds = makeAs('s'),
            asMinutes = makeAs('m'),
            asHours = makeAs('h'),
            asDays = makeAs('d'),
            asWeeks = makeAs('w'),
            asMonths = makeAs('M'),
            asQuarters = makeAs('Q'),
            asYears = makeAs('y');

        function clone$1() {
            return createDuration(this);
        }

        function get$2(units) {
            units = normalizeUnits(units);
            return this.isValid() ? this[units + 's']() : NaN;
        }

        function makeGetter(name) {
            return function () {
                return this.isValid() ? this._data[name] : NaN;
            };
        }

        var milliseconds = makeGetter('milliseconds'),
            seconds = makeGetter('seconds'),
            minutes = makeGetter('minutes'),
            hours = makeGetter('hours'),
            days = makeGetter('days'),
            months = makeGetter('months'),
            years = makeGetter('years');

        function weeks() {
            return absFloor(this.days() / 7);
        }

        var round = Math.round,
            thresholds = {
                ss: 44, // a few seconds to seconds
                s: 45, // seconds to minute
                m: 45, // minutes to hour
                h: 22, // hours to day
                d: 26, // days to month/week
                w: null, // weeks to month
                M: 11, // months to year
            };

        // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
        function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
            return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
        }

        function relativeTime$1(posNegDuration, withoutSuffix, thresholds, locale) {
            var duration = createDuration(posNegDuration).abs(),
                seconds = round(duration.as('s')),
                minutes = round(duration.as('m')),
                hours = round(duration.as('h')),
                days = round(duration.as('d')),
                months = round(duration.as('M')),
                weeks = round(duration.as('w')),
                years = round(duration.as('y')),
                a =
                    (seconds <= thresholds.ss && ['s', seconds]) ||
                    (seconds < thresholds.s && ['ss', seconds]) ||
                    (minutes <= 1 && ['m']) ||
                    (minutes < thresholds.m && ['mm', minutes]) ||
                    (hours <= 1 && ['h']) ||
                    (hours < thresholds.h && ['hh', hours]) ||
                    (days <= 1 && ['d']) ||
                    (days < thresholds.d && ['dd', days]);

            if (thresholds.w != null) {
                a =
                    a ||
                    (weeks <= 1 && ['w']) ||
                    (weeks < thresholds.w && ['ww', weeks]);
            }
            a = a ||
                (months <= 1 && ['M']) ||
                (months < thresholds.M && ['MM', months]) ||
                (years <= 1 && ['y']) || ['yy', years];

            a[2] = withoutSuffix;
            a[3] = +posNegDuration > 0;
            a[4] = locale;
            return substituteTimeAgo.apply(null, a);
        }

        // This function allows you to set the rounding function for relative time strings
        function getSetRelativeTimeRounding(roundingFunction) {
            if (roundingFunction === undefined) {
                return round;
            }
            if (typeof roundingFunction === 'function') {
                round = roundingFunction;
                return true;
            }
            return false;
        }

        // This function allows you to set a threshold for relative time strings
        function getSetRelativeTimeThreshold(threshold, limit) {
            if (thresholds[threshold] === undefined) {
                return false;
            }
            if (limit === undefined) {
                return thresholds[threshold];
            }
            thresholds[threshold] = limit;
            if (threshold === 's') {
                thresholds.ss = limit - 1;
            }
            return true;
        }

        function humanize(argWithSuffix, argThresholds) {
            if (!this.isValid()) {
                return this.localeData().invalidDate();
            }

            var withSuffix = false,
                th = thresholds,
                locale,
                output;

            if (typeof argWithSuffix === 'object') {
                argThresholds = argWithSuffix;
                argWithSuffix = false;
            }
            if (typeof argWithSuffix === 'boolean') {
                withSuffix = argWithSuffix;
            }
            if (typeof argThresholds === 'object') {
                th = Object.assign({}, thresholds, argThresholds);
                if (argThresholds.s != null && argThresholds.ss == null) {
                    th.ss = argThresholds.s - 1;
                }
            }

            locale = this.localeData();
            output = relativeTime$1(this, !withSuffix, th, locale);

            if (withSuffix) {
                output = locale.pastFuture(+this, output);
            }

            return locale.postformat(output);
        }

        var abs$1 = Math.abs;

        function sign(x) {
            return (x > 0) - (x < 0) || +x;
        }

        function toISOString$1() {
            // for ISO strings we do not use the normal bubbling rules:
            //  * milliseconds bubble up until they become hours
            //  * days do not bubble at all
            //  * months bubble up until they become years
            // This is because there is no context-free conversion between hours and days
            // (think of clock changes)
            // and also not between days and months (28-31 days per month)
            if (!this.isValid()) {
                return this.localeData().invalidDate();
            }

            var seconds = abs$1(this._milliseconds) / 1000,
                days = abs$1(this._days),
                months = abs$1(this._months),
                minutes,
                hours,
                years,
                s,
                total = this.asSeconds(),
                totalSign,
                ymSign,
                daysSign,
                hmsSign;

            if (!total) {
                // this is the same as C#'s (Noda) and python (isodate)...
                // but not other JS (goog.date)
                return 'P0D';
            }

            // 3600 seconds -> 60 minutes -> 1 hour
            minutes = absFloor(seconds / 60);
            hours = absFloor(minutes / 60);
            seconds %= 60;
            minutes %= 60;

            // 12 months -> 1 year
            years = absFloor(months / 12);
            months %= 12;

            // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
            s = seconds ? seconds.toFixed(3).replace(/\.?0+$/, '') : '';

            totalSign = total < 0 ? '-' : '';
            ymSign = sign(this._months) !== sign(total) ? '-' : '';
            daysSign = sign(this._days) !== sign(total) ? '-' : '';
            hmsSign = sign(this._milliseconds) !== sign(total) ? '-' : '';

            return (
                totalSign +
                'P' +
                (years ? ymSign + years + 'Y' : '') +
                (months ? ymSign + months + 'M' : '') +
                (days ? daysSign + days + 'D' : '') +
                (hours || minutes || seconds ? 'T' : '') +
                (hours ? hmsSign + hours + 'H' : '') +
                (minutes ? hmsSign + minutes + 'M' : '') +
                (seconds ? hmsSign + s + 'S' : '')
            );
        }

        var proto$2 = Duration.prototype;

        proto$2.isValid = isValid$1;
        proto$2.abs = abs;
        proto$2.add = add$1;
        proto$2.subtract = subtract$1;
        proto$2.as = as;
        proto$2.asMilliseconds = asMilliseconds;
        proto$2.asSeconds = asSeconds;
        proto$2.asMinutes = asMinutes;
        proto$2.asHours = asHours;
        proto$2.asDays = asDays;
        proto$2.asWeeks = asWeeks;
        proto$2.asMonths = asMonths;
        proto$2.asQuarters = asQuarters;
        proto$2.asYears = asYears;
        proto$2.valueOf = valueOf$1;
        proto$2._bubble = bubble;
        proto$2.clone = clone$1;
        proto$2.get = get$2;
        proto$2.milliseconds = milliseconds;
        proto$2.seconds = seconds;
        proto$2.minutes = minutes;
        proto$2.hours = hours;
        proto$2.days = days;
        proto$2.weeks = weeks;
        proto$2.months = months;
        proto$2.years = years;
        proto$2.humanize = humanize;
        proto$2.toISOString = toISOString$1;
        proto$2.toString = toISOString$1;
        proto$2.toJSON = toISOString$1;
        proto$2.locale = locale;
        proto$2.localeData = localeData;

        proto$2.toIsoString = deprecate(
            'toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)',
            toISOString$1
        );
        proto$2.lang = lang;

        // FORMATTING

        addFormatToken('X', 0, 0, 'unix');
        addFormatToken('x', 0, 0, 'valueOf');

        // PARSING

        addRegexToken('x', matchSigned);
        addRegexToken('X', matchTimestamp);
        addParseToken('X', function (input, array, config) {
            config._d = new Date(parseFloat(input) * 1000);
        });
        addParseToken('x', function (input, array, config) {
            config._d = new Date(toInt(input));
        });

        //! moment.js

        hooks.version = '2.29.4';

        setHookCallback(createLocal);

        hooks.fn = proto;
        hooks.min = min;
        hooks.max = max;
        hooks.now = now;
        hooks.utc = createUTC;
        hooks.unix = createUnix;
        hooks.months = listMonths;
        hooks.isDate = isDate;
        hooks.locale = getSetGlobalLocale;
        hooks.invalid = createInvalid;
        hooks.duration = createDuration;
        hooks.isMoment = isMoment;
        hooks.weekdays = listWeekdays;
        hooks.parseZone = createInZone;
        hooks.localeData = getLocale;
        hooks.isDuration = isDuration;
        hooks.monthsShort = listMonthsShort;
        hooks.weekdaysMin = listWeekdaysMin;
        hooks.defineLocale = defineLocale;
        hooks.updateLocale = updateLocale;
        hooks.locales = listLocales;
        hooks.weekdaysShort = listWeekdaysShort;
        hooks.normalizeUnits = normalizeUnits;
        hooks.relativeTimeRounding = getSetRelativeTimeRounding;
        hooks.relativeTimeThreshold = getSetRelativeTimeThreshold;
        hooks.calendarFormat = getCalendarFormat;
        hooks.prototype = proto;

        // currently HTML5 input type only supports 24-hour formats
        hooks.HTML5_FMT = {
            DATETIME_LOCAL: 'YYYY-MM-DDTHH:mm', // <input type="datetime-local" />
            DATETIME_LOCAL_SECONDS: 'YYYY-MM-DDTHH:mm:ss', // <input type="datetime-local" step="1" />
            DATETIME_LOCAL_MS: 'YYYY-MM-DDTHH:mm:ss.SSS', // <input type="datetime-local" step="0.001" />
            DATE: 'YYYY-MM-DD', // <input type="date" />
            TIME: 'HH:mm', // <input type="time" />
            TIME_SECONDS: 'HH:mm:ss', // <input type="time" step="1" />
            TIME_MS: 'HH:mm:ss.SSS', // <input type="time" step="0.001" />
            WEEK: 'GGGG-[W]WW', // <input type="week" />
            MONTH: 'YYYY-MM', // <input type="month" />
        };

        return hooks;

    })));
    });

    /* src/ResultsTable.svelte generated by Svelte v3.50.1 */

    const file$9 = "src/ResultsTable.svelte";

    function get_each_context$6(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	return child_ctx;
    }

    // (5:1) {#each players as p}
    function create_each_block$6(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*p*/ ctx[1].name + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*p*/ ctx[1].currentPosition + "";
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			add_location(td0, file$9, 6, 3, 79);
    			add_location(td1, file$9, 7, 3, 100);
    			add_location(tr, file$9, 5, 2, 71);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(tr, t3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*players*/ 1 && t0_value !== (t0_value = /*p*/ ctx[1].name + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*players*/ 1 && t2_value !== (t2_value = /*p*/ ctx[1].currentPosition + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$6.name,
    		type: "each",
    		source: "(5:1) {#each players as p}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let table;
    	let each_value = /*players*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$6(get_each_context$6(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			table = element("table");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(table, "class", "svelte-dblkmh");
    			add_location(table, file$9, 3, 0, 39);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*players*/ 1) {
    				each_value = /*players*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$6(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$6(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(table, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(table);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ResultsTable', slots, []);
    	let { players } = $$props;
    	const writable_props = ['players'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ResultsTable> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('players' in $$props) $$invalidate(0, players = $$props.players);
    	};

    	$$self.$capture_state = () => ({ players });

    	$$self.$inject_state = $$props => {
    		if ('players' in $$props) $$invalidate(0, players = $$props.players);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [players];
    }

    class ResultsTable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { players: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ResultsTable",
    			options,
    			id: create_fragment$9.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*players*/ ctx[0] === undefined && !('players' in props)) {
    			console.warn("<ResultsTable> was created without expected prop 'players'");
    		}
    	}

    	get players() {
    		throw new Error("<ResultsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set players(value) {
    		throw new Error("<ResultsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Weekly.svelte generated by Svelte v3.50.1 */

    const { console: console_1$1 } = globals;
    const file$8 = "src/Weekly.svelte";

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[18] = list[i];
    	child_ctx[20] = i;
    	return child_ctx;
    }

    // (339:0) {:else}
    function create_else_block$3(ctx) {
    	let t;
    	let div;
    	let current_block_type_index;
    	let if_block1;
    	let current;

    	function select_block_type_1(ctx, dirty) {
    		if (/*tourneyName*/ ctx[1]) return create_if_block_4$1;
    		return create_else_block_2;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block0 = current_block_type(ctx);
    	const if_block_creators = [create_if_block_2$2, create_if_block_3$1, create_else_block_1$1];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*teams*/ ctx[0]) return 0;
    		if (/*error*/ ctx[3]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block0.c();
    			t = space();
    			div = element("div");
    			if_block1.c();
    			attr_dev(div, "class", "teams");
    			add_location(div, file$8, 346, 0, 14369);
    		},
    		m: function mount(target, anchor) {
    			if_block0.m(target, anchor);
    			insert_dev(target, t, anchor);
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block1 = if_blocks[current_block_type_index];

    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				} else {
    					if_block1.p(ctx, dirty);
    				}

    				transition_in(if_block1, 1);
    				if_block1.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_block0.d(detaching);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(339:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (333:0) {#if rawResults}
    function create_if_block$6(ctx) {
    	let t;
    	let resultstable;
    	let current;
    	let if_block = /*tourneyName*/ ctx[1] && create_if_block_1$3(ctx);

    	resultstable = new ResultsTable({
    			props: { players: /*resultsPlayers*/ ctx[4] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			t = space();
    			create_component(resultstable.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(resultstable, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*tourneyName*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$3(ctx);
    					if_block.c();
    					if_block.m(t.parentNode, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(resultstable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(resultstable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(resultstable, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$6.name,
    		type: "if",
    		source: "(333:0) {#if rawResults}",
    		ctx
    	});

    	return block;
    }

    // (343:0) {:else}
    function create_else_block_2(ctx) {
    	let img;
    	let img_src_value;
    	let span;

    	const block = {
    		c: function create() {
    			img = element("img");
    			span = element("span");
    			span.textContent = " Loading current tournament";
    			attr_dev(img, "class", "sheets-icon");
    			if (!src_url_equal(img.src, img_src_value = "https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Loading");
    			add_location(img, file$8, 343, 1, 14190);
    			add_location(span, file$8, 343, 127, 14316);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    			insert_dev(target, span, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2.name,
    		type: "else",
    		source: "(343:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (341:0) {#if tourneyName}
    function create_if_block_4$1(ctx) {
    	let h1;
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(/*tourneyName*/ ctx[1]);
    			attr_dev(h1, "class", "tourney-name svelte-19j5pxu");
    			add_location(h1, file$8, 341, 1, 14137);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*tourneyName*/ 2) set_data_dev(t, /*tourneyName*/ ctx[1]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4$1.name,
    		type: "if",
    		source: "(341:0) {#if tourneyName}",
    		ctx
    	});

    	return block;
    }

    // (364:1) {:else}
    function create_else_block_1$1(ctx) {
    	let img;
    	let img_src_value;
    	let span;

    	const block = {
    		c: function create() {
    			img = element("img");
    			span = element("span");
    			span.textContent = " Scraping the PGA";
    			attr_dev(img, "class", "sheets-icon");
    			if (!src_url_equal(img.src, img_src_value = "https://upload.wikimedia.org/wikipedia/en/thumb/7/77/PGA_Tour_logo.svg/233px-PGA_Tour_logo.svg.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Loading");
    			add_location(img, file$8, 364, 2, 14749);
    			add_location(span, file$8, 364, 146, 14893);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    			insert_dev(target, span, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1$1.name,
    		type: "else",
    		source: "(364:1) {:else}",
    		ctx
    	});

    	return block;
    }

    // (358:17) 
    function create_if_block_3$1(ctx) {
    	let div;
    	let code0;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let br;
    	let t4;
    	let code1;
    	let t5;
    	let t6;

    	const block = {
    		c: function create() {
    			div = element("div");
    			code0 = element("code");
    			t0 = text("🚨 ");
    			t1 = text(/*error*/ ctx[3]);
    			t2 = text(" 🚨");
    			t3 = space();
    			br = element("br");
    			t4 = space();
    			code1 = element("code");
    			t5 = text("Scraping Blurb: ");
    			t6 = text(/*blurb*/ ctx[2]);
    			add_location(code0, file$8, 359, 3, 14654);
    			add_location(br, file$8, 360, 3, 14684);
    			add_location(code1, file$8, 361, 3, 14692);
    			attr_dev(div, "class", "error svelte-19j5pxu");
    			add_location(div, file$8, 358, 2, 14631);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, code0);
    			append_dev(code0, t0);
    			append_dev(code0, t1);
    			append_dev(code0, t2);
    			append_dev(div, t3);
    			append_dev(div, br);
    			append_dev(div, t4);
    			append_dev(div, code1);
    			append_dev(code1, t5);
    			append_dev(code1, t6);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*error*/ 8) set_data_dev(t1, /*error*/ ctx[3]);
    			if (dirty & /*blurb*/ 4) set_data_dev(t6, /*blurb*/ ctx[2]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(358:17) ",
    		ctx
    	});

    	return block;
    }

    // (348:1) {#if teams}
    function create_if_block_2$2(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*teams*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*teams*/ 1) {
    				each_value = /*teams*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(348:1) {#if teams}",
    		ctx
    	});

    	return block;
    }

    // (349:2) {#each teams as team, i}
    function create_each_block$5(ctx) {
    	let table;
    	let tr;
    	let td;
    	let team;
    	let t;
    	let current;

    	team = new Team({
    			props: {
    				team: /*team*/ ctx[18],
    				placeNumber: /*i*/ ctx[20] + 1,
    				isFavorite: false
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			table = element("table");
    			tr = element("tr");
    			td = element("td");
    			create_component(team.$$.fragment);
    			t = space();
    			add_location(td, file$8, 351, 5, 14491);
    			add_location(tr, file$8, 350, 4, 14481);
    			attr_dev(table, "class", "team svelte-19j5pxu");
    			attr_dev(table, "width", "100%");
    			attr_dev(table, "border", "0");
    			add_location(table, file$8, 349, 3, 14432);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);
    			append_dev(table, tr);
    			append_dev(tr, td);
    			mount_component(team, td, null);
    			append_dev(table, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const team_changes = {};
    			if (dirty & /*teams*/ 1) team_changes.team = /*team*/ ctx[18];
    			team.$set(team_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(team.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(team.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(table);
    			destroy_component(team);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$5.name,
    		type: "each",
    		source: "(349:2) {#each teams as team, i}",
    		ctx
    	});

    	return block;
    }

    // (334:1) {#if tourneyName}
    function create_if_block_1$3(ctx) {
    	let h1;
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(/*tourneyName*/ ctx[1]);
    			add_location(h1, file$8, 334, 2, 14035);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*tourneyName*/ 2) set_data_dev(t, /*tourneyName*/ ctx[1]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(334:1) {#if tourneyName}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$6, create_else_block$3];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*rawResults*/ ctx[5]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if_block.p(ctx, dirty);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Weekly', slots, []);
    	let teams, tourneyName, leaderboard, favoriteTeam, blurb;
    	let resultsPlayers = [];
    	let { nate = window.location.search.indexOf("nate") != -1 } = $$props;
    	let trueUrl = window.location.href.replace("?league=dv", "");
    	let rawResults = window.location.href.includes("results");
    	let error;

    	// onMount do all of our async functions
    	onMount(async () => {
    		try {
    			const tournaments = await getRelevantTournament();
    			const rawTeams = await getTeamRosters();

    			// if (tournaments[0].id == "018") {
    			// 	processTeamTournament(tournaments[0])
    			// }
    			// else {
    			// 
    			// }
    			const firstTourneyTeams = processFirstTourney(rawTeams, await getPgaStandings(tournaments[0]));

    			// If there's more than 1 tournament then we need to process the 2nd one also
    			if (tournaments.length > 1) {
    				const secondTourneyTeams = await processSecondTourney(tournaments[1], firstTourneyTeams);
    				$$invalidate(0, teams = await sortTeams(secondTourneyTeams));
    			} else {
    				$$invalidate(0, teams = sortTeams(firstTourneyTeams));
    			}
    		} catch(e) {
    			$$invalidate(3, error = e);
    		}
    	});

    	// Hit the google sheet for the schedule
    	const getRelevantTournament = async () => {
    		const endpoint = `https://docs.google.com/spreadsheets/d/1c231M42E4NkKsIqpMdMGALBmW9S6GAuhdS5KWVB4F50/gviz/tq?tqx=out:json&tq&gid=61191989`;

    		// const endpoint = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/schedule` + "?timestamp=" + Date.now()
    		const response = await fetch(endpoint);

    		const text = await response.text();
    		const data = await JSON.parse(text.substring(47).slice(0, -2)).table;
    		const today = new Date();
    		const tourneysBeforeToday = data.rows.filter(event => new Date(Date.parse(event.c[1].f)) < today.setHours(0, 0, 0, 0));
    		const tournaments = [];

    		const payoutPercentages = [
    			null,
    			0.18,
    			0.109,
    			0.069,
    			0.049,
    			0.041,
    			0.03625,
    			0.03375,
    			0.03125,
    			0.02925,
    			0.02725,
    			0.02525,
    			0.02325,
    			0.02125,
    			0.01925,
    			0.01825,
    			0.01725,
    			0.01625,
    			0.01525,
    			0.01425,
    			0.01325,
    			0.01225,
    			0.01125,
    			0.01045,
    			0.00965,
    			0.00885,
    			0.00805,
    			0.00775,
    			0.00745,
    			0.00715,
    			0.00685,
    			0.00655,
    			0.00625,
    			0.00595,
    			0.0057,
    			0.00545,
    			0.0052,
    			0.00495,
    			0.00475,
    			0.00455,
    			0.00435,
    			0.00415,
    			0.00395,
    			0.00375,
    			0.00355,
    			0.00335,
    			0.00315,
    			0.00295,
    			0.00279,
    			0.00265,
    			0.00257,
    			0.00251,
    			0.00245,
    			0.00241,
    			0.00237,
    			0.00235,
    			0.00233,
    			0.00231,
    			0.00229,
    			0.00227,
    			0.00225,
    			0.00223,
    			0.00221,
    			0.00219,
    			0.00217,
    			0.00215
    		];

    		// grab the last tournament but check if any others have the same date
    		tourneysBeforeToday.forEach(t => {
    			if (tourneysBeforeToday.slice(-1)[0].c[1].f === t.c[1].f) {
    				tournaments.push({
    					"id": t.c[2].v,
    					"name": t.c[0].v,
    					"totalPurse": t.c[3].v / 0.18,
    					"payouts": payoutPercentages.map(n => n * (t.c[3].v / 0.18))
    				});
    			}
    		});

    		$$invalidate(1, tourneyName = tournaments.map(t => t.name).join(" / "));
    		return tournaments;
    	};

    	// Once we have the PGA Standings, process our first Tournament
    	const processFirstTourney = (rawTeams, pgaStanding) => {
    		rawTeams.forEach(team => {
    			team.processed = true;
    			team.totalMoney = 0.0;

    			team.roster.forEach(player => {
    				const pgaPlayerMatches = pgaStanding.filter(p => p.playerId === player.id);

    				if (pgaPlayerMatches.length > 0) {
    					player.isPlaying = true;
    					const pgaPlayer = pgaPlayerMatches[0];
    					(player.name = pgaPlayer.playerNames.firstName + ' ' + pgaPlayer.playerNames.lastName, player.positionNum = parseInt(pgaPlayer.positionCurrent.replace(/\D/g, '')), player.position = pgaPlayer.positionCurrent, player.projMoney = pgaPlayer.projected_money_event, player.today = pgaPlayer.round, player.thru = pgaPlayer.thru, player.total = pgaPlayer.total, player.playerId = pgaPlayer.playerId, player.pgaStatus = pgaPlayer.status, team.totalMoney += pgaPlayer.projected_money_event, player.secondTourney = false, player.firstRoundTeeTime = moment(pgaPlayer.tee_time).format("h:mm a"));
    				}
    			});
    		});

    		rawTeams.forEach(team => {
    			team.roster.forEach(player => {
    				if (player.isPlaying === undefined) {
    					player.isPlaying = false;

    					// If not playing put at bottom of list
    					player.sort = -2;
    				} else {
    					if (isNaN(player.positionNum)) {
    						// Next up is cut players
    						player.sort = -1;
    					} else {
    						// Then sort by projected money
    						player.sort = parseInt(player.projMoney);
    					}
    				}
    			});
    		});

    		return rawTeams;
    	};

    	const processSecondTourney = async (tourneyId, firstTourneyTeams) => {
    		const standings = await getPgaStandings(tourneyId);

    		await firstTourneyTeams.forEach(team => {
    			team.roster.forEach(player => {
    				const pgaPlayerMatches = standings.filter(p => p.playerId === player.id);

    				if (pgaPlayerMatches.length > 0) {
    					player.isPlaying = true;
    					const pgaPlayer = pgaPlayerMatches[0];
    					(player.name = pgaPlayer.playerNames.firstName + ' ' + pgaPlayer.playerNames.lastName, player.positionNum = parseInt(pgaPlayer.positionCurrent.replace(/\D/g, '')), player.position = pgaPlayer.positionCurrent, player.projMoney = pgaPlayer.projected_money_event, player.today = pgaPlayer.round, player.thru = pgaPlayer.thru, player.total = pgaPlayer.total, player.playerId = pgaPlayer.playerId, player.pgaStatus = pgaPlayer.status, team.totalMoney += pgaPlayer.projected_money_event, player.secondTourney = true, player.firstRoundTeeTime = moment(pgaPlayer.tee_time).format("h:mm a"));
    				}
    			});
    		});

    		await firstTourneyTeams.forEach(team => {
    			team.roster.forEach(player => {
    				if (player.isPlaying === undefined) {
    					player.isPlaying = false;

    					// If not playing put at bottom of list
    					player.sort = -2;
    				} else {
    					if (isNaN(player.positionNum)) {
    						// Next up is cut players
    						player.sort = -1;
    					} else {
    						// Then sort by projected money
    						player.sort = parseInt(player.projMoney);
    					}
    				}
    			});
    		});

    		return firstTourneyTeams;
    	};

    	// Sort by total money for standings
    	const sortTeams = rawTeams => {
    		const sortedTeams = rawTeams.sort((a, b) => {
    			return a.totalMoney > b.totalMoney
    			? -1
    			: a.totalMoney < b.totalMoney ? 1 : 0;
    		});

    		sortedTeams.forEach(team => {
    			const sortedRoster = team.roster.sort((a, b) => a.sort < b.sort ? 1 : -1);
    			team.roster = sortedRoster;
    		});

    		return rawTeams;
    	};

    	const getPgaStandings = async tournament => {
    		// Hit KVDB to get our security blurb so we can call the PGA method
    		const response = await fetch(`https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/pgasecurityblurb?timestamp=` + Date.now());

    		const securityBlurb = await response.text();
    		$$invalidate(2, blurb = await securityBlurb);
    		return makePgaCall(securityBlurb, tournament);
    	};

    	const makePgaCall = async (securityBlurb, tournament) => {
    		if (tournament.id != "018") {
    			const pgaResp = await fetch("https://lbdata.pgatour.com/2023/r/" + tournament.id + "/leaderboard.json" + securityBlurb + "&timestamp=" + Date.now());
    			var jsonResp = await pgaResp.json();
    			leaderboard = await jsonResp.rows;
    		} else {
    			leaderboard = await makePgaCallTeamTourney(securityBlurb, tournament);
    			console.log(leaderboard);
    		}

    		var numberPlayersEachPlace = {
    			"1": [0, 0],
    			"2": [0, 0],
    			"3": [0, 0],
    			"4": [0, 0],
    			"5": [0, 0],
    			"6": [0, 0],
    			"7": [0, 0],
    			"8": [0, 0],
    			"9": [0, 0],
    			"10": [0, 0],
    			"11": [0, 0],
    			"12": [0, 0],
    			"13": [0, 0],
    			"14": [0, 0],
    			"15": [0, 0],
    			"16": [0, 0],
    			"17": [0, 0],
    			"18": [0, 0],
    			"19": [0, 0],
    			"20": [0, 0],
    			"21": [0, 0],
    			"22": [0, 0],
    			"23": [0, 0],
    			"24": [0, 0],
    			"25": [0, 0],
    			"26": [0, 0],
    			"27": [0, 0],
    			"28": [0, 0],
    			"29": [0, 0],
    			"30": [0, 0],
    			"31": [0, 0],
    			"32": [0, 0],
    			"33": [0, 0],
    			"34": [0, 0],
    			"35": [0, 0],
    			"36": [0, 0],
    			"37": [0, 0],
    			"38": [0, 0],
    			"39": [0, 0],
    			"40": [0, 0],
    			"41": [0, 0],
    			"42": [0, 0],
    			"43": [0, 0],
    			"44": [0, 0],
    			"45": [0, 0],
    			"46": [0, 0],
    			"47": [0, 0],
    			"48": [0, 0],
    			"49": [0, 0],
    			"50": [0, 0],
    			"51": [0, 0],
    			"52": [0, 0],
    			"53": [0, 0],
    			"54": [0, 0],
    			"55": [0, 0],
    			"56": [0, 0],
    			"57": [0, 0],
    			"58": [0, 0],
    			"59": [0, 0],
    			"60": [0, 0],
    			"61": [0, 0],
    			"62": [0, 0],
    			"63": [0, 0],
    			"64": [0, 0],
    			"65": [0, 0],
    			"66": [0, 0],
    			"67": [0, 0],
    			"68": [0, 0],
    			"69": [0, 0],
    			"70": [0, 0],
    			"71": [0, 0],
    			"72": [0, 0],
    			"73": [0, 0],
    			"74": [0, 0],
    			"75": [0, 0],
    			"76": [0, 0],
    			"77": [0, 0],
    			"78": [0, 0],
    			"79": [0, 0],
    			"80": [0, 0],
    			"81": [0, 0],
    			"82": [0, 0],
    			"83": [0, 0],
    			"84": [0, 0],
    			"85": [0, 0],
    			"86": [0, 0],
    			"87": [0, 0],
    			"88": [0, 0],
    			"89": [0, 0],
    			"90": [0, 0],
    			"91": [0, 0],
    			"92": [0, 0],
    			"93": [0, 0],
    			"94": [0, 0],
    			"95": [0, 0],
    			"96": [0, 0],
    			"97": [0, 0],
    			"98": [0, 0],
    			"99": [0, 0],
    			"100": [0, 0],
    			"101": [0, 0],
    			"102": [0, 0],
    			"103": [0, 0],
    			"104": [0, 0],
    			"105": [0, 0],
    			"106": [0, 0],
    			"107": [0, 0],
    			"108": [0, 0],
    			"109": [0, 0],
    			"110": [0, 0],
    			"111": [0, 0],
    			"112": [0, 0],
    			"113": [0, 0],
    			"114": [0, 0],
    			"115": [0, 0],
    			"116": [0, 0],
    			"117": [0, 0],
    			"118": [0, 0],
    			"119": [0, 0],
    			"120": [0, 0],
    			"121": [0, 0],
    			"122": [0, 0],
    			"123": [0, 0],
    			"124": [0, 0],
    			"125": [0, 0],
    			"126": [0, 0],
    			"127": [0, 0],
    			"128": [0, 0],
    			"129": [0, 0],
    			"130": [0, 0],
    			"131": [0, 0],
    			"132": [0, 0],
    			"133": [0, 0],
    			"134": [0, 0],
    			"135": [0, 0],
    			"136": [0, 0],
    			"137": [0, 0],
    			"138": [0, 0],
    			"139": [0, 0],
    			"140": [0, 0],
    			"141": [0, 0],
    			"142": [0, 0],
    			"143": [0, 0],
    			"144": [0, 0],
    			"145": [0, 0],
    			"146": [0, 0],
    			"147": [0, 0],
    			"148": [0, 0],
    			"149": [0, 0],
    			"150": [0, 0],
    			"151": [0, 0],
    			"152": [0, 0],
    			"153": [0, 0],
    			"154": [0, 0],
    			"155": [0, 0],
    			"156": [0, 0],
    			"157": [0, 0],
    			"158": [0, 0],
    			"159": [0, 0],
    			"160": [0, 0],
    			"161": [0, 0],
    			"162": [0, 0],
    			"163": [0, 0],
    			"164": [0, 0],
    			"165": [0, 0],
    			"166": [0, 0],
    			"167": [0, 0],
    			"168": [0, 0],
    			"169": [0, 0],
    			"170": [0, 0],
    			"171": [0, 0],
    			"172": [0, 0],
    			"173": [0, 0],
    			"174": [0, 0],
    			"175": [0, 0],
    			"176": [0, 0],
    			"177": [0, 0],
    			"178": [0, 0],
    			"179": [0, 0],
    			"180": [0, 0],
    			"181": [0, 0],
    			"182": [0, 0],
    			"183": [0, 0],
    			"184": [0, 0],
    			"185": [0, 0],
    			"186": [0, 0],
    			"187": [0, 0],
    			"188": [0, 0],
    			"189": [0, 0],
    			"190": [0, 0],
    			"191": [0, 0],
    			"192": [0, 0],
    			"193": [0, 0],
    			"194": [0, 0],
    			"195": [0, 0],
    			"196": [0, 0],
    			"197": [0, 0],
    			"198": [0, 0],
    			"199": [0, 0],
    			"200": [0, 0]
    		};

    		await leaderboard.forEach(player => {
    			var positionNum = parseInt(player.positionCurrent.replace(/\D/g, ''));

    			if (!isNaN(positionNum) && positionNum > 0) {
    				numberPlayersEachPlace[positionNum + ""][0] += 1;
    			}
    		});

    		await tournament.payouts.forEach((p, i) => {
    			if (i > 0) {
    				var numPlayersTiedAtPosition = numberPlayersEachPlace[i + ""][0];
    				var totalPayout = 0;

    				if (numPlayersTiedAtPosition > 1) {
    					// Add the money from the people who are tied...
    					for (let step = i; step < i + numPlayersTiedAtPosition; step++) {
    						totalPayout += tournament.payouts[step] ? tournament.payouts[step] : 0;
    					}
    				} else {
    					totalPayout = tournament.payouts[i];
    				}

    				numberPlayersEachPlace[i + ""][1] = 1.0 * totalPayout / numPlayersTiedAtPosition;
    			}
    		});

    		await leaderboard.forEach(player => {
    			// Do the math manually. Get the positionNum and then payouts[n-1] = payout 
    			var positionNum = parseInt(player.positionCurrent.replace(/\D/g, ''));

    			// if there's a payout (above 65) else 0
    			player.projected_money_event = numberPlayersEachPlace[positionNum]
    			? numberPlayersEachPlace[positionNum][1]
    			: 0;
    		});

    		// await console.log(numberPlayersEachPlace)
    		return leaderboard;
    	};

    	const makePgaCallTeamTourney = async (securityBlurb, tournament) => {
    		const pgaResp = await fetch("https://statdata.pgatour.com/r/" + tournament.id + "/teamleaderboard-v2.json" + securityBlurb + "&timestamp=" + Date.now());
    		var jsonResp = await pgaResp.json();
    		leaderboard = await jsonResp.leaderboard;
    		var processedResponse = [];

    		leaderboard.teams.forEach(t => {
    			t.teamPlayers.forEach(p => {
    				p.isActive = true;
    				p.status = "active";
    				p.playerId = p.pid;
    				p.positionCurrent = t.current_position;
    				p.total = t.total;
    				p.thru = t.thru;
    				p.round = t.today;

    				if (p.firstName + " " + p.lastName == t.teamPlayers[0].firstName + " " + t.teamPlayers[0].lastName) {
    					p.playerNames = {
    						"firstName": "🏌️‍♂️" + t.teamPlayers[0].firstName + " " + t.teamPlayers[0].lastName + " / ",
    						"lastName": t.teamPlayers[1].firstName + " " + t.teamPlayers[1].lastName
    					};
    				} else {
    					p.playerNames = {
    						"firstName": t.teamPlayers[0].firstName + " " + t.teamPlayers[0].lastName + " / ",
    						"lastName": "🏌️‍♂️" + t.teamPlayers[1].firstName + " " + t.teamPlayers[1].lastName
    					};
    				}

    				processedResponse.push(p);
    			});
    		});

    		// console.log(processedResponse)
    		return processedResponse;
    	};

    	// Get our team rosters from the Google Sheet / KVDB
    	const getTeamRosters = async () => {
    		let spreadsheet_id = "1c231M42E4NkKsIqpMdMGALBmW9S6GAuhdS5KWVB4F50";
    		let gid = "629583302";
    		let endpoint = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid;

    		// let endpoint = "https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/rosters" + "?timestamp=" + Date.now()
    		const response = await fetch(endpoint);

    		const text = await response.text();
    		const data = await JSON.parse(text.substring(47).slice(0, -2)).table;
    		const cols = data.cols.map(col => col.label);
    		console.log(cols);

    		// Grab all the players
    		const players = [];

    		data.rows.forEach(row => {
    			const obj = {};

    			cols.forEach((col, i) => {
    				obj[col] = row.c[i] == null ? null : row.c[i].v;
    			});

    			if (obj["Team"] != null) {
    				players.push(obj);
    			}
    		});

    		// Get unique team names
    		let teamNames = [...new Set(players.map(p => p.Team))];

    		// Assign rosters to teams
    		let teams = [];

    		teamNames.forEach(team => {
    			let obj = {
    				"teamName": team.replace(")", "").split(" (")[0],
    				"owner": team.replace(")", "").split(" (")[1],
    				"roster": []
    			};

    			players.forEach(player => {
    				if (player.Team == team) {
    					obj.roster.push({
    						"id": player.PGAID + "",
    						"name": player.Golfers
    					});
    				}
    			});

    			teams.push(obj);
    		});

    		return teams;
    	};

    	const writable_props = ['nate'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$1.warn(`<Weekly> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('nate' in $$props) $$invalidate(6, nate = $$props.nate);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		Team,
    		moment,
    		ResultsTable,
    		teams,
    		tourneyName,
    		leaderboard,
    		favoriteTeam,
    		blurb,
    		resultsPlayers,
    		nate,
    		trueUrl,
    		rawResults,
    		error,
    		getRelevantTournament,
    		processFirstTourney,
    		processSecondTourney,
    		sortTeams,
    		getPgaStandings,
    		makePgaCall,
    		makePgaCallTeamTourney,
    		getTeamRosters
    	});

    	$$self.$inject_state = $$props => {
    		if ('teams' in $$props) $$invalidate(0, teams = $$props.teams);
    		if ('tourneyName' in $$props) $$invalidate(1, tourneyName = $$props.tourneyName);
    		if ('leaderboard' in $$props) leaderboard = $$props.leaderboard;
    		if ('favoriteTeam' in $$props) favoriteTeam = $$props.favoriteTeam;
    		if ('blurb' in $$props) $$invalidate(2, blurb = $$props.blurb);
    		if ('resultsPlayers' in $$props) $$invalidate(4, resultsPlayers = $$props.resultsPlayers);
    		if ('nate' in $$props) $$invalidate(6, nate = $$props.nate);
    		if ('trueUrl' in $$props) trueUrl = $$props.trueUrl;
    		if ('rawResults' in $$props) $$invalidate(5, rawResults = $$props.rawResults);
    		if ('error' in $$props) $$invalidate(3, error = $$props.error);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [teams, tourneyName, blurb, error, resultsPlayers, rawResults, nate];
    }

    class Weekly extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { nate: 6 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Weekly",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get nate() {
    		throw new Error("<Weekly>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set nate(value) {
    		throw new Error("<Weekly>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/WeeklyEspn.svelte generated by Svelte v3.50.1 */
    const file$7 = "src/WeeklyEspn.svelte";

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i];
    	child_ctx[18] = i;
    	return child_ctx;
    }

    // (183:0) {:else}
    function create_else_block_1(ctx) {
    	let img;
    	let img_src_value;
    	let span;

    	const block = {
    		c: function create() {
    			img = element("img");
    			span = element("span");
    			span.textContent = " Loading current tournament";
    			attr_dev(img, "class", "sheets-icon");
    			if (!src_url_equal(img.src, img_src_value = "https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Loading");
    			add_location(img, file$7, 183, 1, 5715);
    			add_location(span, file$7, 183, 127, 5841);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    			insert_dev(target, span, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(183:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (181:0) {#if tourneyName}
    function create_if_block_4(ctx) {
    	let h1;
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(/*tourneyName*/ ctx[1]);
    			attr_dev(h1, "class", "tourney-name svelte-ih46r3");
    			add_location(h1, file$7, 181, 1, 5662);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*tourneyName*/ 2) set_data_dev(t, /*tourneyName*/ ctx[1]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(181:0) {#if tourneyName}",
    		ctx
    	});

    	return block;
    }

    // (186:0) {#if livTourneyName}
    function create_if_block_3(ctx) {
    	let h1;
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(/*livTourneyName*/ ctx[2]);
    			attr_dev(h1, "class", "tourney-name liv svelte-ih46r3");
    			add_location(h1, file$7, 185, 20, 5913);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*livTourneyName*/ 4) set_data_dev(t, /*livTourneyName*/ ctx[2]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(186:0) {#if livTourneyName}",
    		ctx
    	});

    	return block;
    }

    // (187:0) {#if eurTourneyName}
    function create_if_block_2$1(ctx) {
    	let h1;
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(/*eurTourneyName*/ ctx[3]);
    			attr_dev(h1, "class", "tourney-name eur svelte-ih46r3");
    			add_location(h1, file$7, 186, 20, 5989);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*eurTourneyName*/ 8) set_data_dev(t, /*eurTourneyName*/ ctx[3]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(187:0) {#if eurTourneyName}",
    		ctx
    	});

    	return block;
    }

    // (203:1) {:else}
    function create_else_block$2(ctx) {
    	let img;
    	let img_src_value;
    	let span;

    	const block = {
    		c: function create() {
    			img = element("img");
    			span = element("span");
    			span.textContent = " Scraping ESPN";
    			attr_dev(img, "class", "sheets-icon");
    			if (!src_url_equal(img.src, img_src_value = "https://a.espncdn.com/favicon.ico")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Loading");
    			add_location(img, file$7, 203, 2, 6422);
    			add_location(span, file$7, 203, 81, 6501);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    			insert_dev(target, span, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(203:1) {:else}",
    		ctx
    	});

    	return block;
    }

    // (199:17) 
    function create_if_block_1$2(ctx) {
    	let div;
    	let code;
    	let t0;
    	let t1;
    	let t2;

    	const block = {
    		c: function create() {
    			div = element("div");
    			code = element("code");
    			t0 = text("🚨 ");
    			t1 = text(/*error*/ ctx[4]);
    			t2 = text(" 🚨");
    			add_location(code, file$7, 200, 3, 6375);
    			attr_dev(div, "class", "error svelte-ih46r3");
    			add_location(div, file$7, 199, 2, 6352);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, code);
    			append_dev(code, t0);
    			append_dev(code, t1);
    			append_dev(code, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*error*/ 16) set_data_dev(t1, /*error*/ ctx[4]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(199:17) ",
    		ctx
    	});

    	return block;
    }

    // (189:1) {#if teams}
    function create_if_block$5(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*teams*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*teams*/ 1) {
    				each_value = /*teams*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(189:1) {#if teams}",
    		ctx
    	});

    	return block;
    }

    // (190:2) {#each teams as team, i}
    function create_each_block$4(ctx) {
    	let table;
    	let tr;
    	let td;
    	let team;
    	let t;
    	let current;

    	team = new Team({
    			props: {
    				team: /*team*/ ctx[16],
    				placeNumber: /*i*/ ctx[18] + 1,
    				isFavorite: false,
    				activeGolferCounts: /*team*/ ctx[16].activeGolferCounts
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			table = element("table");
    			tr = element("tr");
    			td = element("td");
    			create_component(team.$$.fragment);
    			t = space();
    			add_location(td, file$7, 192, 5, 6167);
    			add_location(tr, file$7, 191, 4, 6157);
    			attr_dev(table, "class", "team svelte-ih46r3");
    			attr_dev(table, "width", "100%");
    			attr_dev(table, "border", "0");
    			add_location(table, file$7, 190, 3, 6108);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);
    			append_dev(table, tr);
    			append_dev(tr, td);
    			mount_component(team, td, null);
    			append_dev(table, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const team_changes = {};
    			if (dirty & /*teams*/ 1) team_changes.team = /*team*/ ctx[16];
    			if (dirty & /*teams*/ 1) team_changes.activeGolferCounts = /*team*/ ctx[16].activeGolferCounts;
    			team.$set(team_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(team.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(team.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(table);
    			destroy_component(team);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(190:2) {#each teams as team, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let div0;
    	let current_block_type_index;
    	let if_block3;
    	let t3;
    	let div1;
    	let a;
    	let t4;
    	let t5;
    	let br0;
    	let t6;
    	let br1;
    	let current;

    	function select_block_type(ctx, dirty) {
    		if (/*tourneyName*/ ctx[1]) return create_if_block_4;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = /*livTourneyName*/ ctx[2] && create_if_block_3(ctx);
    	let if_block2 = /*eurTourneyName*/ ctx[3] && create_if_block_2$1(ctx);
    	const if_block_creators = [create_if_block$5, create_if_block_1$2, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*teams*/ ctx[0]) return 0;
    		if (/*error*/ ctx[4]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			div0 = element("div");
    			if_block3.c();
    			t3 = space();
    			div1 = element("div");
    			a = element("a");
    			t4 = text("🔄");
    			t5 = space();
    			br0 = element("br");
    			t6 = space();
    			br1 = element("br");
    			attr_dev(div0, "class", "teams");
    			add_location(div0, file$7, 187, 0, 6045);
    			attr_dev(a, "href", window.location.origin + window.location.pathname + '?v=' + new Date().valueOf());
    			attr_dev(a, "class", "svelte-ih46r3");
    			add_location(a, file$7, 208, 1, 6556);
    			add_location(div1, file$7, 207, 0, 6549);
    			add_location(br0, file$7, 210, 0, 6663);
    			add_location(br1, file$7, 211, 0, 6668);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_block0.m(target, anchor);
    			insert_dev(target, t0, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, div0, anchor);
    			if_blocks[current_block_type_index].m(div0, null);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, a);
    			append_dev(a, t4);
    			insert_dev(target, t5, anchor);
    			insert_dev(target, br0, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, br1, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(t0.parentNode, t0);
    				}
    			}

    			if (/*livTourneyName*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					if_block1.m(t1.parentNode, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*eurTourneyName*/ ctx[3]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_2$1(ctx);
    					if_block2.c();
    					if_block2.m(t2.parentNode, t2);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block3 = if_blocks[current_block_type_index];

    				if (!if_block3) {
    					if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block3.c();
    				} else {
    					if_block3.p(ctx, dirty);
    				}

    				transition_in(if_block3, 1);
    				if_block3.m(div0, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block3);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block3);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_block0.d(detaching);
    			if (detaching) detach_dev(t0);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div0);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t5);
    			if (detaching) detach_dev(br0);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(br1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('WeeklyEspn', slots, []);

    	let teams,
    		leaderboard,
    		favoriteTeam,
    		blurb,
    		tournaments,
    		golfers,
    		rawTeams,
    		processedTeams;

    	let tourneyName, livTourneyName, eurTourneyName;
    	let resultsPlayers = [];
    	let rawResults = window.location.href.includes("results");
    	let error;

    	// onMount do all of our async functions
    	onMount(async () => {
    		try {
    			rawTeams = await getTeamRosters();
    			$$invalidate(0, teams = await hitESPN(rawTeams, "pga"));
    			$$invalidate(0, teams = await hitESPN(rawTeams, "liv"));
    			$$invalidate(0, teams = await hitESPN(rawTeams, "eur"));
    			await teams.sort((a, b) => b.totalMoney - a.totalMoney);

    			teams.forEach(team => {
    				team.roster = team.roster.sort((a, b) => b.sort - a.sort);
    			});
    		} catch(e) {
    			$$invalidate(4, error = e);
    		}
    	});

    	// Hit ESPN for the standings
    	const hitESPN = async (rawTeams, leagueSlug) => {
    		const endpoint = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=` + leagueSlug;
    		const response = await fetch(endpoint);
    		const json = await response.json();

    		// console.log(json)
    		if (json.events.length == 0 || json.events[0].name == "Hero Cup") {
    			var dateDiff = -100;
    		} else {
    			var dateDiff = Math.floor((new Date() - Date.parse(json.events[0].endDate)) / (1000 * 60 * 60 * 24));
    		}

    		if (dateDiff >= -4 && dateDiff <= 4) {
    			switch (leagueSlug) {
    				case "pga":
    					$$invalidate(1, tourneyName = json.events[0].name);
    					break;
    				case "liv":
    					$$invalidate(2, livTourneyName = json.events[0].name);
    					break;
    				case "eur":
    					$$invalidate(3, eurTourneyName = json.events[0].name);
    					break;
    			}

    			golfers = json.events[0].competitions[0].competitors;

    			golfers = golfers.sort((a, b) => {
    				return Number(a.status.position.id) - Number(b.status.position.id);
    			});

    			var purse = json.events[0].purse;

    			var payoutPercentages = [
    				null,
    				0.18,
    				0.109,
    				0.069,
    				0.049,
    				0.041,
    				0.03625,
    				0.03375,
    				0.03125,
    				0.02925,
    				0.02725,
    				0.02525,
    				0.02325,
    				0.02125,
    				0.01925,
    				0.01825,
    				0.01725,
    				0.01625,
    				0.01525,
    				0.01425,
    				0.01325,
    				0.01225,
    				0.01125,
    				0.01045,
    				0.00965,
    				0.00885,
    				0.00805,
    				0.00775,
    				0.00745,
    				0.00715,
    				0.00685,
    				0.00655,
    				0.00625,
    				0.00595,
    				0.0057,
    				0.00545,
    				0.0052,
    				0.00495,
    				0.00475,
    				0.00455,
    				0.00435,
    				0.00415,
    				0.00395,
    				0.00375,
    				0.00355,
    				0.00335,
    				0.00315,
    				0.00295,
    				0.00279,
    				0.00265,
    				0.00257,
    				0.00251,
    				0.00245,
    				0.00241,
    				0.00237,
    				0.00235,
    				0.00233,
    				0.00231,
    				0.00229,
    				0.00227,
    				0.00225,
    				0.00223,
    				0.00221,
    				0.00219,
    				0.00217,
    				0.00215
    			];

    			const livPayoutPercentages = [
    				null,
    				0.20000,
    				0.10625,
    				0.07500,
    				0.05250,
    				0.04875,
    				0.04000,
    				0.03375,
    				0.03125,
    				0.02900,
    				0.02800,
    				0.02700,
    				0.02250,
    				0.01800,
    				0.01350,
    				0.01250,
    				0.01200,
    				0.01160,
    				0.01130,
    				0.01100,
    				0.01000,
    				0.00900,
    				0.00860,
    				0.00850,
    				0.00840,
    				0.00830,
    				0.00820,
    				0.00810,
    				0.00800,
    				0.00790,
    				0.00780,
    				0.00770,
    				0.00760,
    				0.00750,
    				0.00740,
    				0.00730,
    				0.00720,
    				0.00710,
    				0.00700,
    				0.00690,
    				0.00680,
    				0.00670,
    				0.00660,
    				0.00650,
    				0.00640,
    				0.00630,
    				0.00620,
    				0.00610,
    				0.00600
    			];

    			golfers.forEach(g => {
    				if (leagueSlug == "liv") {
    					g.estimatedEarnings = livPayoutPercentages[g.status.position.id] * purse * 0.27;
    				} else {
    					g.estimatedEarnings = payoutPercentages[g.status.position.id] * purse;
    				}

    				if (isNaN(g.estimatedEarnings)) {
    					g.estimatedEarnings = 0;
    				}
    			});

    			await golfers.map(g => g.id);

    			rawTeams.forEach(team => {
    				team.roster.forEach(player => {
    					const matches = golfers.filter(g => g.id == player.espnId);

    					if (matches.length > 0) {
    						const golfer = matches[0];
    						player.isPlaying = true;
    						player.position = golfer.status.position.displayName;
    						player.projMoney = golfer.estimatedEarnings;

    						if (golfer.estimatedEarnings) {
    							team.totalMoney += golfer.estimatedEarnings;
    						}

    						player.pgaStatus = golfer.status.shortDetail;
    						player.total = golfer.score.displayValue;
    						player.today = golfer.linescores.at(-1).displayValue;
    						player.thru = golfer.status.thru;
    						player.league = leagueSlug;
    						player.sort = golfer.estimatedEarnings;
    						team.activeGolferCounts[leagueSlug] += 1;
    					}
    				});
    			});
    		}

    		return rawTeams;
    	};

    	// Get our team rosters from the Google Sheet / KVDB
    	const getTeamRosters = async () => {
    		let spreadsheet_id = "1c231M42E4NkKsIqpMdMGALBmW9S6GAuhdS5KWVB4F50";
    		let gid = "629583302";
    		let endpoint = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid;

    		// let endpoint = "https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/rosters" + "?timestamp=" + Date.now()
    		const response = await fetch(endpoint);

    		const text = await response.text();
    		const data = await JSON.parse(text.substring(47).slice(0, -2)).table;
    		const cols = data.cols.map(col => col.label);

    		// Grab all the players
    		const players = [];

    		data.rows.forEach(row => {
    			const obj = {};

    			cols.forEach((col, i) => {
    				obj[col] = row.c[i] == null ? null : row.c[i].v;
    			});

    			if (obj["Team"] != null) {
    				players.push(obj);
    			}
    		});

    		// Get unique team names
    		let teamNames = [...new Set(players.map(p => p.Team))];

    		// Assign rosters to teams
    		let teams = [];

    		teamNames.forEach(team => {
    			let obj = {
    				"teamName": team.replace(")", "").split(" (")[0],
    				"owner": team.replace(")", "").split(" (")[1],
    				"roster": []
    			};

    			players.forEach(player => {
    				if (player.Team == team) {
    					obj.roster.push({
    						"id": player.PGAID + "",
    						"name": player.Golfers,
    						"espnId": player.ESPNID
    					});
    				}
    			});

    			teams.push(obj);
    		});

    		teams.forEach(t => t.totalMoney = 0);

    		teams.forEach(t => {
    			t.roster.forEach(p => p.sort = 0);
    			t.activeGolferCounts = { ["pga"]: 0, ["liv"]: 0, ["eur"]: 0 };
    		});

    		return teams;
    	};

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<WeeklyEspn> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		onMount,
    		Team,
    		moment,
    		ResultsTable,
    		teams,
    		leaderboard,
    		favoriteTeam,
    		blurb,
    		tournaments,
    		golfers,
    		rawTeams,
    		processedTeams,
    		tourneyName,
    		livTourneyName,
    		eurTourneyName,
    		resultsPlayers,
    		rawResults,
    		error,
    		hitESPN,
    		getTeamRosters
    	});

    	$$self.$inject_state = $$props => {
    		if ('teams' in $$props) $$invalidate(0, teams = $$props.teams);
    		if ('leaderboard' in $$props) leaderboard = $$props.leaderboard;
    		if ('favoriteTeam' in $$props) favoriteTeam = $$props.favoriteTeam;
    		if ('blurb' in $$props) blurb = $$props.blurb;
    		if ('tournaments' in $$props) tournaments = $$props.tournaments;
    		if ('golfers' in $$props) golfers = $$props.golfers;
    		if ('rawTeams' in $$props) rawTeams = $$props.rawTeams;
    		if ('processedTeams' in $$props) processedTeams = $$props.processedTeams;
    		if ('tourneyName' in $$props) $$invalidate(1, tourneyName = $$props.tourneyName);
    		if ('livTourneyName' in $$props) $$invalidate(2, livTourneyName = $$props.livTourneyName);
    		if ('eurTourneyName' in $$props) $$invalidate(3, eurTourneyName = $$props.eurTourneyName);
    		if ('resultsPlayers' in $$props) resultsPlayers = $$props.resultsPlayers;
    		if ('rawResults' in $$props) rawResults = $$props.rawResults;
    		if ('error' in $$props) $$invalidate(4, error = $$props.error);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [teams, tourneyName, livTourneyName, eurTourneyName, error];
    }

    class WeeklyEspn extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "WeeklyEspn",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    /* src/OverallRoster.svelte generated by Svelte v3.50.1 */
    const file$6 = "src/OverallRoster.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	return child_ctx;
    }

    // (41:3) {#each roster as player}
    function create_each_block$3(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*player*/ ctx[1].name + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = numeral(/*player*/ ctx[1].earnings).format('$0,0') + "";
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			attr_dev(td0, "class", "svelte-guy1rs");
    			add_location(td0, file$6, 42, 5, 775);
    			attr_dev(td1, "class", "svelte-guy1rs");
    			add_location(td1, file$6, 43, 5, 803);
    			attr_dev(tr, "class", "player-row svelte-guy1rs");
    			add_location(tr, file$6, 41, 4, 746);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(tr, t3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*roster*/ 1 && t0_value !== (t0_value = /*player*/ ctx[1].name + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*roster*/ 1 && t2_value !== (t2_value = numeral(/*player*/ ctx[1].earnings).format('$0,0') + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(41:3) {#each roster as player}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let div;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t1;
    	let th1;
    	let t3;
    	let tbody;
    	let div_transition;
    	let current;
    	let each_value = /*roster*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Golfer";
    			t1 = space();
    			th1 = element("th");
    			th1.textContent = "Earnings";
    			t3 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(th0, "class", "roster-header svelte-guy1rs");
    			add_location(th0, file$6, 35, 4, 590);
    			attr_dev(th1, "class", "roster-header svelte-guy1rs");
    			add_location(th1, file$6, 36, 16, 644);
    			add_location(tr, file$6, 34, 3, 581);
    			add_location(thead, file$6, 33, 2, 570);
    			add_location(tbody, file$6, 39, 2, 706);
    			attr_dev(table, "class", "roster-table svelte-guy1rs");
    			add_location(table, file$6, 32, 1, 539);
    			attr_dev(div, "class", "roster svelte-guy1rs");
    			add_location(div, file$6, 31, 0, 500);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t1);
    			append_dev(tr, th1);
    			append_dev(table, t3);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*numeral, roster*/ 1) {
    				each_value = /*roster*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('OverallRoster', slots, []);
    	let { roster } = $$props;
    	const writable_props = ['roster'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<OverallRoster> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('roster' in $$props) $$invalidate(0, roster = $$props.roster);
    	};

    	$$self.$capture_state = () => ({ slide, roster });

    	$$self.$inject_state = $$props => {
    		if ('roster' in $$props) $$invalidate(0, roster = $$props.roster);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [roster];
    }

    class OverallRoster extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { roster: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "OverallRoster",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*roster*/ ctx[0] === undefined && !('roster' in props)) {
    			console.warn("<OverallRoster> was created without expected prop 'roster'");
    		}
    	}

    	get roster() {
    		throw new Error("<OverallRoster>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set roster(value) {
    		throw new Error("<OverallRoster>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/OverallTeam.svelte generated by Svelte v3.50.1 */
    const file$5 = "src/OverallTeam.svelte";

    // (42:2) {#if rosterVisible}
    function create_if_block$4(ctx) {
    	let overallroster;
    	let current;

    	overallroster = new OverallRoster({
    			props: { roster: /*team*/ ctx[0].roster },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(overallroster.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(overallroster, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const overallroster_changes = {};
    			if (dirty & /*team*/ 1) overallroster_changes.roster = /*team*/ ctx[0].roster;
    			overallroster.$set(overallroster_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(overallroster.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(overallroster.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(overallroster, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(42:2) {#if rosterVisible}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div3;
    	let div2;
    	let div1;
    	let table;
    	let tbody;
    	let tr;
    	let td0;
    	let t0;
    	let t1;
    	let td1;
    	let span;
    	let t2_value = numeral(/*team*/ ctx[0].balance).format("$0") + "";
    	let t2;
    	let span_class_value;
    	let t3;
    	let td2;
    	let t4_value = /*team*/ ctx[0].name + "";
    	let t4;
    	let t5;
    	let div0;
    	let t6_value = /*team*/ ctx[0].owner + "";
    	let t6;
    	let td2_class_value;
    	let t7;
    	let td3;
    	let t8_value = numeral(/*team*/ ctx[0].earnings).format('$0,0') + "";
    	let t8;
    	let br;
    	let td3_class_value;
    	let t9;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*rosterVisible*/ ctx[3] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			table = element("table");
    			tbody = element("tbody");
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(/*placeNumber*/ ctx[1]);
    			t1 = space();
    			td1 = element("td");
    			span = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = space();
    			div0 = element("div");
    			t6 = text(t6_value);
    			t7 = space();
    			td3 = element("td");
    			t8 = text(t8_value);
    			br = element("br");
    			t9 = space();
    			if (if_block) if_block.c();
    			attr_dev(td0, "class", "standings-place-number svelte-iodfys");
    			attr_dev(td0, "width", "20");
    			add_location(td0, file$5, 26, 6, 623);
    			attr_dev(span, "class", span_class_value = "team-total-payout " + (/*team*/ ctx[0].balance < 0 ? 'negative' : '') + " svelte-iodfys");
    			add_location(span, file$5, 28, 7, 730);
    			attr_dev(td1, "width", "50");
    			attr_dev(td1, "align", "left");
    			add_location(td1, file$5, 27, 6, 694);
    			attr_dev(div0, "class", "owner " + (/*dvLeague*/ ctx[4] ? " invisible" : "") + " svelte-iodfys");
    			add_location(div0, file$5, 32, 7, 942);
    			attr_dev(td2, "class", td2_class_value = "team-name" + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-iodfys");
    			add_location(td2, file$5, 30, 6, 862);
    			add_location(br, file$5, 35, 46, 1133);
    			attr_dev(td3, "class", td3_class_value = "team-earnings" + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-iodfys");
    			add_location(td3, file$5, 34, 6, 1029);
    			add_location(tr, file$5, 25, 5, 612);
    			add_location(tbody, file$5, 24, 4, 599);
    			attr_dev(table, "border", "0");
    			attr_dev(table, "width", "100%");
    			add_location(table, file$5, 23, 3, 563);
    			attr_dev(div1, "class", "header svelte-iodfys");
    			add_location(div1, file$5, 22, 2, 539);
    			attr_dev(div2, "class", "team svelte-iodfys");
    			add_location(div2, file$5, 21, 1, 494);
    			attr_dev(div3, "class", "team svelte-iodfys");
    			add_location(div3, file$5, 20, 0, 474);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, table);
    			append_dev(table, tbody);
    			append_dev(tbody, tr);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, span);
    			append_dev(span, t2);
    			append_dev(tr, t3);
    			append_dev(tr, td2);
    			append_dev(td2, t4);
    			append_dev(td2, t5);
    			append_dev(td2, div0);
    			append_dev(div0, t6);
    			append_dev(tr, t7);
    			append_dev(tr, td3);
    			append_dev(td3, t8);
    			append_dev(td3, br);
    			append_dev(div2, t9);
    			if (if_block) if_block.m(div2, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div2, "click", /*toggleRoster*/ ctx[5], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*placeNumber*/ 2) set_data_dev(t0, /*placeNumber*/ ctx[1]);
    			if ((!current || dirty & /*team*/ 1) && t2_value !== (t2_value = numeral(/*team*/ ctx[0].balance).format("$0") + "")) set_data_dev(t2, t2_value);

    			if (!current || dirty & /*team*/ 1 && span_class_value !== (span_class_value = "team-total-payout " + (/*team*/ ctx[0].balance < 0 ? 'negative' : '') + " svelte-iodfys")) {
    				attr_dev(span, "class", span_class_value);
    			}

    			if ((!current || dirty & /*team*/ 1) && t4_value !== (t4_value = /*team*/ ctx[0].name + "")) set_data_dev(t4, t4_value);
    			if ((!current || dirty & /*team*/ 1) && t6_value !== (t6_value = /*team*/ ctx[0].owner + "")) set_data_dev(t6, t6_value);

    			if (!current || dirty & /*isFavorite*/ 4 && td2_class_value !== (td2_class_value = "team-name" + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-iodfys")) {
    				attr_dev(td2, "class", td2_class_value);
    			}

    			if ((!current || dirty & /*team*/ 1) && t8_value !== (t8_value = numeral(/*team*/ ctx[0].earnings).format('$0,0') + "")) set_data_dev(t8, t8_value);

    			if (!current || dirty & /*isFavorite*/ 4 && td3_class_value !== (td3_class_value = "team-earnings" + (/*isFavorite*/ ctx[2] ? " favorite" : "") + " svelte-iodfys")) {
    				attr_dev(td3, "class", td3_class_value);
    			}

    			if (/*rosterVisible*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*rosterVisible*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div2, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('OverallTeam', slots, []);
    	let { team, placeNumber, isFavorite } = $$props;
    	let rosterVisible = false;
    	let dvLeague = window.location.href.includes("?league=dv");

    	function toggleRoster() {
    		$$invalidate(3, rosterVisible = !rosterVisible);
    		//  		hitType: 'event',
    	} //  		eventCategory: 'Overall',
    	//  		eventAction: 'Click Team',

    	const writable_props = ['team', 'placeNumber', 'isFavorite'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<OverallTeam> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('team' in $$props) $$invalidate(0, team = $$props.team);
    		if ('placeNumber' in $$props) $$invalidate(1, placeNumber = $$props.placeNumber);
    		if ('isFavorite' in $$props) $$invalidate(2, isFavorite = $$props.isFavorite);
    	};

    	$$self.$capture_state = () => ({
    		OverallRoster,
    		team,
    		placeNumber,
    		isFavorite,
    		rosterVisible,
    		dvLeague,
    		toggleRoster
    	});

    	$$self.$inject_state = $$props => {
    		if ('team' in $$props) $$invalidate(0, team = $$props.team);
    		if ('placeNumber' in $$props) $$invalidate(1, placeNumber = $$props.placeNumber);
    		if ('isFavorite' in $$props) $$invalidate(2, isFavorite = $$props.isFavorite);
    		if ('rosterVisible' in $$props) $$invalidate(3, rosterVisible = $$props.rosterVisible);
    		if ('dvLeague' in $$props) $$invalidate(4, dvLeague = $$props.dvLeague);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [team, placeNumber, isFavorite, rosterVisible, dvLeague, toggleRoster];
    }

    class OverallTeam extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { team: 0, placeNumber: 1, isFavorite: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "OverallTeam",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*team*/ ctx[0] === undefined && !('team' in props)) {
    			console.warn("<OverallTeam> was created without expected prop 'team'");
    		}

    		if (/*placeNumber*/ ctx[1] === undefined && !('placeNumber' in props)) {
    			console.warn("<OverallTeam> was created without expected prop 'placeNumber'");
    		}

    		if (/*isFavorite*/ ctx[2] === undefined && !('isFavorite' in props)) {
    			console.warn("<OverallTeam> was created without expected prop 'isFavorite'");
    		}
    	}

    	get team() {
    		throw new Error("<OverallTeam>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set team(value) {
    		throw new Error("<OverallTeam>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeNumber() {
    		throw new Error("<OverallTeam>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeNumber(value) {
    		throw new Error("<OverallTeam>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFavorite() {
    		throw new Error("<OverallTeam>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFavorite(value) {
    		throw new Error("<OverallTeam>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Overall.svelte generated by Svelte v3.50.1 */

    const { console: console_1 } = globals;
    const file$4 = "src/Overall.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	child_ctx[7] = i;
    	return child_ctx;
    }

    // (109:1) {:else}
    function create_else_block$1(ctx) {
    	let img;
    	let img_src_value;
    	let span;

    	const block = {
    		c: function create() {
    			img = element("img");
    			span = element("span");
    			span.textContent = " Loading overall standings";
    			attr_dev(img, "class", "sheets-icon");
    			if (!src_url_equal(img.src, img_src_value = "https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png")) attr_dev(img, "src", img_src_value);
    			add_location(img, file$4, 109, 2, 3235);
    			add_location(span, file$4, 109, 114, 3347);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    			insert_dev(target, span, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(109:1) {:else}",
    		ctx
    	});

    	return block;
    }

    // (98:1) {#if overall}
    function create_if_block$3(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*overall*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*overall*/ 1) {
    				each_value = /*overall*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(98:1) {#if overall}",
    		ctx
    	});

    	return block;
    }

    // (99:2) {#each overall as team, i}
    function create_each_block$2(ctx) {
    	let table;
    	let tr;
    	let td;
    	let overallteam;
    	let t;
    	let current;

    	overallteam = new OverallTeam({
    			props: {
    				team: /*team*/ ctx[5],
    				placeNumber: /*i*/ ctx[7] + 1,
    				isFavorite: false
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			table = element("table");
    			tr = element("tr");
    			td = element("td");
    			create_component(overallteam.$$.fragment);
    			t = space();
    			add_location(td, file$4, 101, 5, 3088);
    			add_location(tr, file$4, 100, 4, 3078);
    			attr_dev(table, "class", "team svelte-ed6l2r");
    			attr_dev(table, "width", "100%");
    			attr_dev(table, "border", "0");
    			add_location(table, file$4, 99, 3, 3029);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);
    			append_dev(table, tr);
    			append_dev(tr, td);
    			mount_component(overallteam, td, null);
    			append_dev(table, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const overallteam_changes = {};
    			if (dirty & /*overall*/ 1) overallteam_changes.team = /*team*/ ctx[5];
    			overallteam.$set(overallteam_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(overallteam.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(overallteam.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(table);
    			destroy_component(overallteam);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(99:2) {#each overall as team, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block$3, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*overall*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "class", "teams");
    			add_location(div, file$4, 96, 0, 2962);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Overall', slots, []);
    	let overall, favoriteTeam;
    	let nate = window.location.search.indexOf("nate") != -1;

    	// export let dvLeague = false
    	onMount(async () => {
    		$$invalidate(0, overall = await getOverallStandings());

    		if (document.cookie.split('; ').find(row => row.startsWith('favoriteTeam'))) {
    			favoriteTeam = document.cookie.split('; ').find(row => row.startsWith('favoriteTeam')).split('=')[1];
    		} else {
    			favoriteTeam = "";
    		}
    	});

    	function setFavorite(message) {
    		document.cookie = "favoriteTeam=" + message;
    		favoriteTeam = message;

    		ga('send', {
    			hitType: 'event',
    			eventCategory: 'Weekly',
    			eventAction: 'Favorite',
    			eventLabel: teamName
    		});
    	}

    	const getOverallStandings = async () => {
    		let spreadsheet_id = "1c231M42E4NkKsIqpMdMGALBmW9S6GAuhdS5KWVB4F50";
    		let gid_overall = "1520535624";
    		let gid_earnings = "1425386487";

    		// if (nate) {
    		// 	spreadsheet_id = "1Ur-zgH5O5iwTJ3J5pUXT-hu1irNo9W5NfJwWa5RxiW0"
    		// }
    		// First we hit the Overall Standings sheet
    		const endpointOverall = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid_overall;

    		// const endpointOverall = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/overall`
    		const response = await fetch(endpointOverall);

    		const text = await response.text();
    		const raw = await JSON.parse(text.substring(47).slice(0, -2)).table;
    		const overallData = raw.rows.filter(r => r.c[3] != null);

    		// Then we hit the Golfer Earnings sheet
    		const endpointGolferEarnings = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid_earnings;

    		// const endpointGolferEarnings = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/golfer-earnings`
    		const response2 = await fetch(endpointGolferEarnings);

    		const text2 = await response2.text();
    		const data = await JSON.parse(text2.substring(47).slice(0, -2)).table;
    		const cols = data.cols.map(col => col.label);

    		// Grab all the golfers
    		const golfers = [];

    		data.rows.forEach(row => {
    			const obj = {};

    			cols.forEach((col, i) => {
    				obj[col] = row.c[i] == null ? null : row.c[i].v;
    			});

    			if (obj["Team"] != null) {
    				golfers.push(obj);
    			}
    		});

    		let teams = [];

    		// Now go through the teams and assign a roster
    		overallData.forEach(t => {
    			console.log(t);

    			let teamObj = {
    				"nameAndOwner": t.c[1].v,
    				"name": t.c[1].v.replace(")", "").split(" (")[0],
    				"owner": t.c[1].v.replace(")", "").split(" (")[1],
    				"balance": t.c[3].v,
    				"earnings": t.c[2].v,
    				"roster": []
    			};

    			golfers.forEach(golfer => {
    				if (golfer.Team == teamObj["nameAndOwner"]) {
    					teamObj.roster.push({
    						"name": golfer.Name,
    						"earnings": golfer.Earnings
    					});
    				}
    			});

    			teams.push(teamObj);
    		});

    		const sortedTeams = teams.sort((a, b) => {
    			return b.earnings - a.earnings;
    		});

    		console.log(sortedTeams);
    		return sortedTeams;
    	};

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Overall> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		onMount,
    		OverallTeam,
    		overall,
    		favoriteTeam,
    		nate,
    		setFavorite,
    		getOverallStandings
    	});

    	$$self.$inject_state = $$props => {
    		if ('overall' in $$props) $$invalidate(0, overall = $$props.overall);
    		if ('favoriteTeam' in $$props) favoriteTeam = $$props.favoriteTeam;
    		if ('nate' in $$props) nate = $$props.nate;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [overall];
    }

    class Overall extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Overall",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src/ConfidencePool/Pick.svelte generated by Svelte v3.50.1 */

    const file$3 = "src/ConfidencePool/Pick.svelte";

    function create_fragment$3(ctx) {
    	let tr;
    	let td0;
    	let t0;
    	let t1;
    	let td1;
    	let t2;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(/*team*/ ctx[0]);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(/*wager*/ ctx[1]);
    			attr_dev(td0, "class", "" + (null_to_empty(/*pickstatus*/ ctx[2]) + " svelte-r0ljcs"));
    			add_location(td0, file$3, 6, 1, 174);
    			attr_dev(td1, "class", "" + (null_to_empty(/*pickstatus*/ ctx[2]) + " svelte-r0ljcs"));
    			add_location(td1, file$3, 7, 1, 212);
    			attr_dev(tr, "class", "player-row svelte-r0ljcs");
    			add_location(tr, file$3, 5, 0, 149);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*team*/ 1) set_data_dev(t0, /*team*/ ctx[0]);
    			if (dirty & /*wager*/ 2) set_data_dev(t2, /*wager*/ ctx[1]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Pick', slots, []);
    	let { entry, team, wager, pointswon, pointslost } = $$props;

    	let pickstatus = pointswon > 0
    	? "won"
    	: pointslost > 0 ? "lost" : "notplayed";

    	const writable_props = ['entry', 'team', 'wager', 'pointswon', 'pointslost'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Pick> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('entry' in $$props) $$invalidate(3, entry = $$props.entry);
    		if ('team' in $$props) $$invalidate(0, team = $$props.team);
    		if ('wager' in $$props) $$invalidate(1, wager = $$props.wager);
    		if ('pointswon' in $$props) $$invalidate(4, pointswon = $$props.pointswon);
    		if ('pointslost' in $$props) $$invalidate(5, pointslost = $$props.pointslost);
    	};

    	$$self.$capture_state = () => ({
    		entry,
    		team,
    		wager,
    		pointswon,
    		pointslost,
    		pickstatus
    	});

    	$$self.$inject_state = $$props => {
    		if ('entry' in $$props) $$invalidate(3, entry = $$props.entry);
    		if ('team' in $$props) $$invalidate(0, team = $$props.team);
    		if ('wager' in $$props) $$invalidate(1, wager = $$props.wager);
    		if ('pointswon' in $$props) $$invalidate(4, pointswon = $$props.pointswon);
    		if ('pointslost' in $$props) $$invalidate(5, pointslost = $$props.pointslost);
    		if ('pickstatus' in $$props) $$invalidate(2, pickstatus = $$props.pickstatus);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [team, wager, pickstatus, entry, pointswon, pointslost];
    }

    class Pick extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			entry: 3,
    			team: 0,
    			wager: 1,
    			pointswon: 4,
    			pointslost: 5
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Pick",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*entry*/ ctx[3] === undefined && !('entry' in props)) {
    			console.warn("<Pick> was created without expected prop 'entry'");
    		}

    		if (/*team*/ ctx[0] === undefined && !('team' in props)) {
    			console.warn("<Pick> was created without expected prop 'team'");
    		}

    		if (/*wager*/ ctx[1] === undefined && !('wager' in props)) {
    			console.warn("<Pick> was created without expected prop 'wager'");
    		}

    		if (/*pointswon*/ ctx[4] === undefined && !('pointswon' in props)) {
    			console.warn("<Pick> was created without expected prop 'pointswon'");
    		}

    		if (/*pointslost*/ ctx[5] === undefined && !('pointslost' in props)) {
    			console.warn("<Pick> was created without expected prop 'pointslost'");
    		}
    	}

    	get entry() {
    		throw new Error("<Pick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set entry(value) {
    		throw new Error("<Pick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get team() {
    		throw new Error("<Pick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set team(value) {
    		throw new Error("<Pick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get wager() {
    		throw new Error("<Pick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set wager(value) {
    		throw new Error("<Pick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pointswon() {
    		throw new Error("<Pick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pointswon(value) {
    		throw new Error("<Pick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pointslost() {
    		throw new Error("<Pick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pointslost(value) {
    		throw new Error("<Pick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/ConfidencePool/Entry.svelte generated by Svelte v3.50.1 */
    const file$2 = "src/ConfidencePool/Entry.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    // (45:7) {#if pick["Wager"] === point}
    function create_if_block_1$1(ctx) {
    	let span;
    	let t0_value = /*point*/ ctx[14] + "";
    	let t0;
    	let t1;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();

    			attr_dev(span, "class", "point-value " + (/*pick*/ ctx[11]['Points Won'] > 0
    			? 'pickwon'
    			: /*pick*/ ctx[11]['Points Lost'] > 0 ? 'picklost' : '') + "" + " svelte-h0ildf");

    			add_location(span, file$2, 45, 8, 1485);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t0);
    			append_dev(span, t1);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(45:7) {#if pick[\\\"Wager\\\"] === point}",
    		ctx
    	});

    	return block;
    }

    // (44:6) {#each picks_no_champs as pick}
    function create_each_block_2(ctx) {
    	let if_block_anchor;
    	let if_block = /*pick*/ ctx[11]["Wager"] === /*point*/ ctx[14] && create_if_block_1$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (/*pick*/ ctx[11]["Wager"] === /*point*/ ctx[14]) if_block.p(ctx, dirty);
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(44:6) {#each picks_no_champs as pick}",
    		ctx
    	});

    	return block;
    }

    // (43:5) {#each points as point}
    function create_each_block_1(ctx) {
    	let each_1_anchor;
    	let each_value_2 = /*picks_no_champs*/ ctx[8];
    	validate_each_argument(each_value_2);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*picks_no_champs, points*/ 384) {
    				each_value_2 = /*picks_no_champs*/ ctx[8];
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(43:5) {#each points as point}",
    		ctx
    	});

    	return block;
    }

    // (55:2) {#if picksVisible}
    function create_if_block$2(ctx) {
    	let div;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t1;
    	let th1;
    	let t3;
    	let tbody;
    	let div_transition;
    	let current;
    	let each_value = /*picks*/ ctx[3];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			div = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Team";
    			t1 = space();
    			th1 = element("th");
    			th1.textContent = "Wager";
    			t3 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(th0, "class", "roster-header svelte-h0ildf");
    			add_location(th0, file$2, 60, 7, 1819);
    			attr_dev(th1, "class", "roster-header svelte-h0ildf");
    			add_location(th1, file$2, 61, 19, 1874);
    			add_location(tr, file$2, 59, 6, 1807);
    			add_location(thead, file$2, 58, 5, 1793);
    			add_location(tbody, file$2, 64, 5, 1942);
    			attr_dev(table, "class", "roster-table svelte-h0ildf");
    			add_location(table, file$2, 57, 4, 1759);
    			attr_dev(div, "class", "roster svelte-h0ildf");
    			add_location(div, file$2, 56, 3, 1717);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t1);
    			append_dev(tr, th1);
    			append_dev(table, t3);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*picks*/ 8) {
    				each_value = /*picks*/ ctx[3];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(55:2) {#if picksVisible}",
    		ctx
    	});

    	return block;
    }

    // (66:5) {#each picks as pick}
    function create_each_block$1(ctx) {
    	let pick;
    	let current;

    	pick = new Pick({
    			props: {
    				entry: /*pick*/ ctx[11]['Entry'],
    				team: /*pick*/ ctx[11]['Team'],
    				wager: /*pick*/ ctx[11]['Wager'],
    				pointswon: /*pick*/ ctx[11]['Points Won'],
    				pointslost: /*pick*/ ctx[11]['Points Lost']
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(pick.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(pick, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const pick_changes = {};
    			if (dirty & /*picks*/ 8) pick_changes.entry = /*pick*/ ctx[11]['Entry'];
    			if (dirty & /*picks*/ 8) pick_changes.team = /*pick*/ ctx[11]['Team'];
    			if (dirty & /*picks*/ 8) pick_changes.wager = /*pick*/ ctx[11]['Wager'];
    			if (dirty & /*picks*/ 8) pick_changes.pointswon = /*pick*/ ctx[11]['Points Won'];
    			if (dirty & /*picks*/ 8) pick_changes.pointslost = /*pick*/ ctx[11]['Points Lost'];
    			pick.$set(pick_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(pick.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(pick.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(pick, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(66:5) {#each picks as pick}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div4;
    	let div3;
    	let div2;
    	let table;
    	let tbody;
    	let tr;
    	let td0;
    	let t0;
    	let t1;
    	let td1;
    	let t2;
    	let t3;
    	let div0;
    	let t5;
    	let td2;
    	let span0;
    	let t6;
    	let t7;
    	let t8;
    	let span1;
    	let t9;
    	let t10;
    	let t11;
    	let div1;
    	let t12;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value_1 = /*points*/ ctx[7];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let if_block = /*picksVisible*/ ctx[4] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			table = element("table");
    			tbody = element("tbody");
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(/*placenumber*/ ctx[2]);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(/*teamName*/ ctx[5]);
    			t3 = space();
    			div0 = element("div");
    			div0.textContent = `${/*owner*/ ctx[6]}`;
    			t5 = space();
    			td2 = element("td");
    			span0 = element("span");
    			t6 = text(/*pointswon*/ ctx[0]);
    			t7 = text(" pts");
    			t8 = space();
    			span1 = element("span");
    			t9 = text(/*pointsremaining*/ ctx[1]);
    			t10 = text(" left");
    			t11 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t12 = space();
    			if (if_block) if_block.c();
    			attr_dev(td0, "class", "standings-place-number svelte-h0ildf");
    			attr_dev(td0, "width", "20");
    			add_location(td0, file$2, 28, 6, 891);
    			attr_dev(div0, "class", "owner svelte-h0ildf");
    			add_location(div0, file$2, 31, 7, 1010);
    			attr_dev(td1, "class", "team-name svelte-h0ildf");
    			add_location(td1, file$2, 29, 6, 962);
    			attr_dev(span0, "class", "pointswon svelte-h0ildf");
    			add_location(span0, file$2, 34, 7, 1087);
    			attr_dev(span1, "class", "pointsremaining svelte-h0ildf");
    			add_location(span1, file$2, 35, 7, 1141);
    			attr_dev(td2, "align", "right");
    			add_location(td2, file$2, 33, 6, 1061);
    			add_location(tr, file$2, 27, 5, 880);
    			add_location(tbody, file$2, 26, 4, 867);
    			attr_dev(table, "border", "0");
    			attr_dev(table, "width", "100%");
    			add_location(table, file$2, 25, 3, 831);
    			attr_dev(div1, "class", "point-picks svelte-h0ildf");
    			add_location(div1, file$2, 41, 3, 1347);
    			attr_dev(div2, "class", "header svelte-h0ildf");
    			add_location(div2, file$2, 24, 2, 807);
    			attr_dev(div3, "class", "team svelte-h0ildf");
    			add_location(div3, file$2, 23, 1, 763);
    			attr_dev(div4, "class", "team svelte-h0ildf");
    			add_location(div4, file$2, 22, 0, 743);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, table);
    			append_dev(table, tbody);
    			append_dev(tbody, tr);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(td1, t3);
    			append_dev(td1, div0);
    			append_dev(tr, t5);
    			append_dev(tr, td2);
    			append_dev(td2, span0);
    			append_dev(span0, t6);
    			append_dev(span0, t7);
    			append_dev(td2, t8);
    			append_dev(td2, span1);
    			append_dev(span1, t9);
    			append_dev(span1, t10);
    			append_dev(div2, t11);
    			append_dev(div2, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append_dev(div3, t12);
    			if (if_block) if_block.m(div3, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div3, "click", /*togglePicks*/ ctx[9], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*placenumber*/ 4) set_data_dev(t0, /*placenumber*/ ctx[2]);
    			if (!current || dirty & /*pointswon*/ 1) set_data_dev(t6, /*pointswon*/ ctx[0]);
    			if (!current || dirty & /*pointsremaining*/ 2) set_data_dev(t9, /*pointsremaining*/ ctx[1]);

    			if (dirty & /*picks_no_champs, points*/ 384) {
    				each_value_1 = /*points*/ ctx[7];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (/*picksVisible*/ ctx[4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*picksVisible*/ 16) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div3, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			destroy_each(each_blocks, detaching);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Entry', slots, []);
    	let { entry, pointswon, pointsremaining, placenumber, picks } = $$props;
    	let teamName = entry.slice(0, -1).split(" (")[0];
    	let owner = entry.slice(0, -1).split(" (")[1];
    	let picksVisible = false;

    	let points = [
    		1,
    		2,
    		3,
    		4,
    		5,
    		6,
    		7,
    		8,
    		9,
    		10,
    		11,
    		12,
    		13,
    		14,
    		15,
    		16,
    		17,
    		18,
    		19,
    		20,
    		21,
    		22,
    		23,
    		24,
    		25,
    		26,
    		27,
    		28,
    		29,
    		30,
    		31,
    		32,
    		33,
    		34,
    		35,
    		36,
    		37,
    		38,
    		39,
    		40,
    		41,
    		42
    	];

    	let picks_no_champs = picks.filter((element, index) => index < picks.length - 1);

    	function togglePicks() {
    		$$invalidate(4, picksVisible = !picksVisible);

    		if (picksVisible) {
    			ga('send', {
    				hitType: 'event',
    				eventCategory: 'Confidence Pool',
    				eventAction: 'Click Picks',
    				eventLabel: entry
    			});
    		}
    	}

    	const writable_props = ['entry', 'pointswon', 'pointsremaining', 'placenumber', 'picks'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Entry> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('entry' in $$props) $$invalidate(10, entry = $$props.entry);
    		if ('pointswon' in $$props) $$invalidate(0, pointswon = $$props.pointswon);
    		if ('pointsremaining' in $$props) $$invalidate(1, pointsremaining = $$props.pointsremaining);
    		if ('placenumber' in $$props) $$invalidate(2, placenumber = $$props.placenumber);
    		if ('picks' in $$props) $$invalidate(3, picks = $$props.picks);
    	};

    	$$self.$capture_state = () => ({
    		Pick,
    		slide,
    		entry,
    		pointswon,
    		pointsremaining,
    		placenumber,
    		picks,
    		teamName,
    		owner,
    		picksVisible,
    		points,
    		picks_no_champs,
    		togglePicks
    	});

    	$$self.$inject_state = $$props => {
    		if ('entry' in $$props) $$invalidate(10, entry = $$props.entry);
    		if ('pointswon' in $$props) $$invalidate(0, pointswon = $$props.pointswon);
    		if ('pointsremaining' in $$props) $$invalidate(1, pointsremaining = $$props.pointsremaining);
    		if ('placenumber' in $$props) $$invalidate(2, placenumber = $$props.placenumber);
    		if ('picks' in $$props) $$invalidate(3, picks = $$props.picks);
    		if ('teamName' in $$props) $$invalidate(5, teamName = $$props.teamName);
    		if ('owner' in $$props) $$invalidate(6, owner = $$props.owner);
    		if ('picksVisible' in $$props) $$invalidate(4, picksVisible = $$props.picksVisible);
    		if ('points' in $$props) $$invalidate(7, points = $$props.points);
    		if ('picks_no_champs' in $$props) $$invalidate(8, picks_no_champs = $$props.picks_no_champs);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		pointswon,
    		pointsremaining,
    		placenumber,
    		picks,
    		picksVisible,
    		teamName,
    		owner,
    		points,
    		picks_no_champs,
    		togglePicks,
    		entry
    	];
    }

    class Entry extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			entry: 10,
    			pointswon: 0,
    			pointsremaining: 1,
    			placenumber: 2,
    			picks: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Entry",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*entry*/ ctx[10] === undefined && !('entry' in props)) {
    			console.warn("<Entry> was created without expected prop 'entry'");
    		}

    		if (/*pointswon*/ ctx[0] === undefined && !('pointswon' in props)) {
    			console.warn("<Entry> was created without expected prop 'pointswon'");
    		}

    		if (/*pointsremaining*/ ctx[1] === undefined && !('pointsremaining' in props)) {
    			console.warn("<Entry> was created without expected prop 'pointsremaining'");
    		}

    		if (/*placenumber*/ ctx[2] === undefined && !('placenumber' in props)) {
    			console.warn("<Entry> was created without expected prop 'placenumber'");
    		}

    		if (/*picks*/ ctx[3] === undefined && !('picks' in props)) {
    			console.warn("<Entry> was created without expected prop 'picks'");
    		}
    	}

    	get entry() {
    		throw new Error("<Entry>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set entry(value) {
    		throw new Error("<Entry>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pointswon() {
    		throw new Error("<Entry>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pointswon(value) {
    		throw new Error("<Entry>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pointsremaining() {
    		throw new Error("<Entry>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pointsremaining(value) {
    		throw new Error("<Entry>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placenumber() {
    		throw new Error("<Entry>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placenumber(value) {
    		throw new Error("<Entry>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get picks() {
    		throw new Error("<Entry>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set picks(value) {
    		throw new Error("<Entry>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/ConfidencePool/ConfidencePool.svelte generated by Svelte v3.50.1 */
    const file$1 = "src/ConfidencePool/ConfidencePool.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	child_ctx[7] = i;
    	return child_ctx;
    }

    // (85:0) {#if standings && picks}
    function create_if_block$1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*standings*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*standings*/ 2) {
    				each_value = /*standings*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(85:0) {#if standings && picks}",
    		ctx
    	});

    	return block;
    }

    // (86:1) {#each standings as entry, i}
    function create_each_block(ctx) {
    	let table;
    	let tr;
    	let td;
    	let entry;
    	let t;
    	let current;

    	entry = new Entry({
    			props: {
    				entry: /*entry*/ ctx[5]['Entry'],
    				placenumber: /*i*/ ctx[7] + 1,
    				pointswon: /*entry*/ ctx[5]['Points Won'],
    				pointsremaining: /*entry*/ ctx[5]['Points Remaining'],
    				picks: /*entry*/ ctx[5]['Picks']
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			table = element("table");
    			tr = element("tr");
    			td = element("td");
    			create_component(entry.$$.fragment);
    			t = space();
    			add_location(td, file$1, 88, 4, 2073);
    			add_location(tr, file$1, 87, 3, 2064);
    			attr_dev(table, "class", "team svelte-yqzzuz");
    			attr_dev(table, "width", "100%");
    			attr_dev(table, "border", "0");
    			add_location(table, file$1, 86, 2, 2016);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);
    			append_dev(table, tr);
    			append_dev(tr, td);
    			mount_component(entry, td, null);
    			append_dev(table, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const entry_changes = {};
    			if (dirty & /*standings*/ 2) entry_changes.entry = /*entry*/ ctx[5]['Entry'];
    			if (dirty & /*standings*/ 2) entry_changes.pointswon = /*entry*/ ctx[5]['Points Won'];
    			if (dirty & /*standings*/ 2) entry_changes.pointsremaining = /*entry*/ ctx[5]['Points Remaining'];
    			if (dirty & /*standings*/ 2) entry_changes.picks = /*entry*/ ctx[5]['Picks'];
    			entry.$set(entry_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(entry.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(entry.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(table);
    			destroy_component(entry);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(86:1) {#each standings as entry, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let h1;
    	let t1;
    	let if_block_anchor;
    	let current;
    	let if_block = /*standings*/ ctx[1] && /*picks*/ ctx[0] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "'Cans Confidence Pool";
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(h1, "class", "svelte-yqzzuz");
    			add_location(h1, file$1, 82, 0, 1877);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*standings*/ ctx[1] && /*picks*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*standings, picks*/ 3) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ConfidencePool', slots, []);
    	let spreadsheet_id = "1ciYHM-Aan8auuuep--A90OaGKEAaMnkoqrH4ccXppRI";
    	let picks, standings;

    	onMount(async () => {
    		$$invalidate(0, picks = await getPicks());
    		$$invalidate(1, standings = await getStandings());

    		await standings.forEach(entry => {
    			picks.forEach(pick => {
    				if (pick["Entry"] == entry["Entry"]) {
    					entry["Picks"].push(pick);
    				}
    			});
    		});
    	});

    	const getPicks = async () => {
    		// Pels' / Cavs picks gid
    		let gid = "1752659247";

    		let endpoint = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid;
    		const response = await fetch(endpoint);
    		const text = await response.text();
    		const data = await JSON.parse(text.substring(47).slice(0, -2)).table;
    		const cols = data.cols.map(col => col.label);

    		// Grab all the picks
    		const picks = [];

    		data.rows.forEach(row => {
    			const obj = {};

    			cols.forEach((col, i) => {
    				obj[col] = row.c[i] == null ? null : row.c[i].v;
    			});

    			if (obj["Entry"] != null && obj["Wager"] != null) {
    				picks.push(obj);
    			}
    		});

    		return picks;
    	};

    	const getStandings = async () => {
    		// Pels' standings gid
    		let gid = "1314441307";

    		let endpoint = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid;
    		const response = await fetch(endpoint);
    		const text = await response.text();
    		const data = await JSON.parse(text.substring(47).slice(0, -2)).table;
    		const cols = data.cols.map(col => col.label);

    		// Grab all the picks
    		const standings = [];

    		data.rows.forEach(row => {
    			const obj = {};

    			cols.forEach((col, i) => {
    				obj[col] = row.c[i] == null ? null : row.c[i].v;
    			});

    			obj["Picks"] = [];

    			if (obj["Entry"] != null) {
    				standings.push(obj);
    			}
    		});

    		return standings;
    	};

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ConfidencePool> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		onMount,
    		Pick,
    		Entry,
    		spreadsheet_id,
    		picks,
    		standings,
    		getPicks,
    		getStandings
    	});

    	$$self.$inject_state = $$props => {
    		if ('spreadsheet_id' in $$props) spreadsheet_id = $$props.spreadsheet_id;
    		if ('picks' in $$props) $$invalidate(0, picks = $$props.picks);
    		if ('standings' in $$props) $$invalidate(1, standings = $$props.standings);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [picks, standings];
    }

    class ConfidencePool extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ConfidencePool",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.50.1 */
    const file = "src/App.svelte";

    // (20:0) {:else}
    function create_else_block(ctx) {
    	let div;
    	let picker;
    	let updating_activePage;
    	let t0;
    	let br0;
    	let br1;
    	let t1;
    	let current_block_type_index;
    	let if_block;
    	let current;

    	function picker_activePage_binding(value) {
    		/*picker_activePage_binding*/ ctx[3](value);
    	}

    	let picker_props = { pages: /*pages*/ ctx[1] };

    	if (/*currentPage*/ ctx[0] !== void 0) {
    		picker_props.activePage = /*currentPage*/ ctx[0];
    	}

    	picker = new Picker({ props: picker_props, $$inline: true });
    	binding_callbacks.push(() => bind(picker, 'activePage', picker_activePage_binding));
    	const if_block_creators = [create_if_block_1, create_if_block_2];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*currentPage*/ ctx[0] === "Weekly") return 0;
    		if (/*currentPage*/ ctx[0] === "Overall") return 1;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type_1(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(picker.$$.fragment);
    			t0 = space();
    			br0 = element("br");
    			br1 = element("br");
    			t1 = space();
    			if (if_block) if_block.c();
    			add_location(br0, file, 22, 2, 609);
    			add_location(br1, file, 22, 6, 613);
    			attr_dev(div, "id", "main");
    			attr_dev(div, "class", "svelte-ouw46w");
    			add_location(div, file, 20, 1, 534);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(picker, div, null);
    			append_dev(div, t0);
    			append_dev(div, br0);
    			append_dev(div, br1);
    			append_dev(div, t1);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const picker_changes = {};

    			if (!updating_activePage && dirty & /*currentPage*/ 1) {
    				updating_activePage = true;
    				picker_changes.activePage = /*currentPage*/ ctx[0];
    				add_flush_callback(() => updating_activePage = false);
    			}

    			picker.$set(picker_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(picker.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(picker.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(picker);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(20:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (16:0) {#if confidencePool}
    function create_if_block(ctx) {
    	let div;
    	let confidencepool;
    	let current;
    	confidencepool = new ConfidencePool({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(confidencepool.$$.fragment);
    			attr_dev(div, "id", "main");
    			attr_dev(div, "class", "svelte-ouw46w");
    			add_location(div, file, 16, 1, 480);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(confidencepool, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(confidencepool.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(confidencepool.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(confidencepool);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(16:0) {#if confidencePool}",
    		ctx
    	});

    	return block;
    }

    // (28:38) 
    function create_if_block_2(ctx) {
    	let overall;
    	let current;
    	overall = new Overall({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(overall.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(overall, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(overall.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(overall.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(overall, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(28:38) ",
    		ctx
    	});

    	return block;
    }

    // (25:2) {#if currentPage === "Weekly"}
    function create_if_block_1(ctx) {
    	let weeklyespn;
    	let current;
    	weeklyespn = new WeeklyEspn({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(weeklyespn.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(weeklyespn, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(weeklyespn.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(weeklyespn.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(weeklyespn, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(25:2) {#if currentPage === \\\"Weekly\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*confidencePool*/ ctx[2]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if_block.p(ctx, dirty);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let pages = ["Weekly", "Overall"];
    	let currentPage = "Weekly";
    	let confidencePool = window.location.href.includes("?confidence");
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function picker_activePage_binding(value) {
    		currentPage = value;
    		$$invalidate(0, currentPage);
    	}

    	$$self.$capture_state = () => ({
    		Picker,
    		Weekly,
    		WeeklyEspn,
    		Overall,
    		ConfidencePool,
    		onMount,
    		pages,
    		currentPage,
    		confidencePool
    	});

    	$$self.$inject_state = $$props => {
    		if ('pages' in $$props) $$invalidate(1, pages = $$props.pages);
    		if ('currentPage' in $$props) $$invalidate(0, currentPage = $$props.currentPage);
    		if ('confidencePool' in $$props) $$invalidate(2, confidencePool = $$props.confidencePool);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [currentPage, pages, confidencePool, picker_activePage_binding];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    var app = new App({
    	target: document.body
    });

    function at(n) {
        // ToInteger() abstract op
        n = Math.trunc(n) || 0;
        // Allow negative indexing from the end
        if (n < 0) n += this.length;
        // OOB access is guaranteed to return undefined
        if (n < 0 || n >= this.length) return undefined;
        // Otherwise, this is just normal property access
        return this[n];
    }

    const TypedArray = Reflect.getPrototypeOf(Int8Array);
    for (const C of [Array, String, TypedArray]) {
        Object.defineProperty(C.prototype, "at",
                              { value: at,
                                writable: true,
                                enumerable: false,
                                configurable: true });
    }

    return app;

})();
//# sourceMappingURL=bundle.js.map
