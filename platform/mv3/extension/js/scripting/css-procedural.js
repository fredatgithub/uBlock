/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

/* jshint esversion:11 */

'use strict';

/******************************************************************************/

// Important!
// Isolate from global scope
(function uBOL_cssProcedural() {

/******************************************************************************/

const proceduralImports = self.proceduralImports || [];
self.proceduralImports = undefined;
delete self.proceduralImports;

/******************************************************************************/

const hnParts = [];
try { hnParts.push(...document.location.hostname.split('.')); }
catch(ex) { }
const hnpartslen = hnParts.length;
if ( hnpartslen === 0 ) { return; }

const selectors = [];

for ( const { argsList, exceptionsMap, hostnamesMap, entitiesMap } of proceduralImports ) {
    const todoIndices = new Set();
    const tonotdoIndices = [];
    // Exceptions
    if ( exceptionsMap.size !== 0 ) {
        for ( let i = 0; i < hnpartslen; i++ ) {
            const hn = hnParts.slice(i).join('.');
            const excepted = exceptionsMap.get(hn);
            if ( excepted ) { tonotdoIndices.push(...excepted); }
        }
        exceptionsMap.clear();
    }
    // Hostname-based
    if ( hostnamesMap.size !== 0 ) {
        const collectArgIndices = hn => {
            let argsIndices = hostnamesMap.get(hn);
            if ( argsIndices === undefined ) { return; }
            if ( typeof argsIndices === 'number' ) { argsIndices = [ argsIndices ]; }
            for ( const argsIndex of argsIndices ) {
                if ( tonotdoIndices.includes(argsIndex) ) { continue; }
                todoIndices.add(argsIndex);
            }
        };
        for ( let i = 0; i < hnpartslen; i++ ) {
            const hn = hnParts.slice(i).join('.');
            collectArgIndices(hn);
        }
        collectArgIndices('*');
        hostnamesMap.clear();
    }
    // Entity-based
    if ( entitiesMap.size !== 0 ) {
        const n = hnpartslen - 1;
        for ( let i = 0; i < n; i++ ) {
            for ( let j = n; j > i; j-- ) {
                const en = hnParts.slice(i,j).join('.');
                let argsIndices = entitiesMap.get(en);
                if ( argsIndices === undefined ) { continue; }
                if ( typeof argsIndices === 'number' ) { argsIndices = [ argsIndices ]; }
                for ( const argsIndex of argsIndices ) {
                    if ( tonotdoIndices.includes(argsIndex) ) { continue; }
                    todoIndices.add(argsIndex);
                }
            }
        }
        entitiesMap.clear();
    }
    for ( const i of todoIndices ) {
        selectors.push(...argsList[i].map(json => JSON.parse(json)));
    }
    argsList.length = 0;
}
proceduralImports.length = 0;

if ( selectors.length === 0 ) { return; }

/******************************************************************************/

const uBOL_injectCSS = (css, count = 10) => {
    chrome.runtime.sendMessage({ what: 'insertCSS', css }).catch(( ) => {
        count -= 1;
        if ( count === 0 ) { return; }
        uBOL_injectCSS(css, count - 1);
    });
};

const nonVisualElements = {
    script: true,
    style: true,
};

const regexFromString = (s, exact = false) => {
    if ( s === '' ) { return /^/; }
    const match = /^\/(.+)\/([i]?)$/.exec(s);
    if ( match !== null ) {
        return new RegExp(match[1], match[2] || undefined);
    }
    const reStr = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(exact ? `^${reStr}$` : reStr, 'i');
};

/******************************************************************************/

// 'P' stands for 'Procedural'

class PSelectorTask {
    begin() {
    }
    end() {
    }
}

/******************************************************************************/

class PSelectorVoidTask extends PSelectorTask {
    constructor(task) {
        super();
        console.info(`uBO: :${task[0]}() operator does not exist`);
    }
    transpose() {
    }
}

/******************************************************************************/

class PSelectorHasTextTask extends PSelectorTask {
    constructor(task) {
        super();
        this.needle = regexFromString(task[1]);
    }
    transpose(node, output) {
        if ( this.needle.test(node.textContent) ) {
            output.push(node);
        }
    }
}

/******************************************************************************/

class PSelectorIfTask extends PSelectorTask {
    constructor(task) {
        super();
        this.pselector = new PSelector(task[1]);
    }
    transpose(node, output) {
        if ( this.pselector.test(node) === this.target ) {
            output.push(node);
        }
    }
}
PSelectorIfTask.prototype.target = true;

class PSelectorIfNotTask extends PSelectorIfTask {
}
PSelectorIfNotTask.prototype.target = false;

/******************************************************************************/

class PSelectorMatchesAttrTask extends PSelectorTask {
    constructor(task) {
        super();
        this.reAttr = regexFromString(task[1].attr, true);
        this.reValue = regexFromString(task[1].value, true);
    }
    transpose(node, output) {
        const attrs = node.getAttributeNames();
        for ( const attr of attrs ) {
            if ( this.reAttr.test(attr) === false ) { continue; }
            if ( this.reValue.test(node.getAttribute(attr)) === false ) { continue; }
            output.push(node);
        }
    }
}

/******************************************************************************/

class PSelectorMatchesCSSTask extends PSelectorTask {
    constructor(task) {
        super();
        this.name = task[1].name;
        this.pseudo = task[1].pseudo ? `::${task[1].pseudo}` : null;
        let arg0 = task[1].value, arg1;
        if ( Array.isArray(arg0) ) {
            arg1 = arg0[1]; arg0 = arg0[0];
        }
        this.value = new RegExp(arg0, arg1);
    }
    transpose(node, output) {
        const style = window.getComputedStyle(node, this.pseudo);
        if ( style !== null && this.value.test(style[this.name]) ) {
            output.push(node);
        }
    }
}
class PSelectorMatchesCSSAfterTask extends PSelectorMatchesCSSTask {
    constructor(task) {
        super(task);
        this.pseudo = '::after';
    }
}

class PSelectorMatchesCSSBeforeTask extends PSelectorMatchesCSSTask {
    constructor(task) {
        super(task);
        this.pseudo = '::before';
    }
}

/******************************************************************************/

class PSelectorMatchesMediaTask extends PSelectorTask {
    constructor(task) {
        super();
        this.mql = window.matchMedia(task[1]);
        if ( this.mql.media === 'not all' ) { return; }
        this.mql.addEventListener('change', ( ) => {
            if ( proceduralFilterer instanceof Object === false ) { return; }
            proceduralFilterer.onDOMChanged([ null ]);
        });
    }
    transpose(node, output) {
        if ( this.mql.matches === false ) { return; }
        output.push(node);
    }
}

/******************************************************************************/

class PSelectorMatchesPathTask extends PSelectorTask {
    constructor(task) {
        super();
        this.needle = regexFromString(
            task[1].replace(/\P{ASCII}/gu, s => encodeURIComponent(s))
        );
    }
    transpose(node, output) {
        if ( this.needle.test(self.location.pathname + self.location.search) ) {
            output.push(node);
        }
    }
}

/******************************************************************************/

class PSelectorMinTextLengthTask extends PSelectorTask {
    constructor(task) {
        super();
        this.min = task[1];
    }
    transpose(node, output) {
        if ( node.textContent.length >= this.min ) {
            output.push(node);
        }
    }
}

/******************************************************************************/

class PSelectorOthersTask extends PSelectorTask {
    constructor() {
        super();
        this.targets = new Set();
    }
    begin() {
        this.targets.clear();
    }
    end(output) {
        const toKeep = new Set(this.targets);
        const toDiscard = new Set();
        const body = document.body;
        let discard = null;
        for ( let keep of this.targets ) {
            while ( keep !== null && keep !== body ) {
                toKeep.add(keep);
                toDiscard.delete(keep);
                discard = keep.previousElementSibling;
                while ( discard !== null ) {
                    if (
                        nonVisualElements[discard.localName] !== true &&
                        toKeep.has(discard) === false
                    ) {
                        toDiscard.add(discard);
                    }
                    discard = discard.previousElementSibling;
                }
                discard = keep.nextElementSibling;
                while ( discard !== null ) {
                    if (
                        nonVisualElements[discard.localName] !== true &&
                        toKeep.has(discard) === false
                    ) {
                        toDiscard.add(discard);
                    }
                    discard = discard.nextElementSibling;
                }
                keep = keep.parentElement;
            }
        }
        for ( discard of toDiscard ) {
            output.push(discard);
        }
        this.targets.clear();
    }
    transpose(candidate) {
        for ( const target of this.targets ) {
            if ( target.contains(candidate) ) { return; }
            if ( candidate.contains(target) ) {
                this.targets.delete(target);
            }
        }
        this.targets.add(candidate);
    }
}

/******************************************************************************/

// https://github.com/AdguardTeam/ExtendedCss/issues/31#issuecomment-302391277
//   Prepend `:scope ` if needed.
class PSelectorSpathTask extends PSelectorTask {
    constructor(task) {
        super();
        this.spath = task[1];
        this.nth = /^(?:\s*[+~]|:)/.test(this.spath);
        if ( this.nth ) { return; }
        if ( /^\s*>/.test(this.spath) ) {
            this.spath = `:scope ${this.spath.trim()}`;
        }
    }
    transpose(node, output) {
        const nodes = this.nth
            ? PSelectorSpathTask.qsa(node, this.spath)
            : node.querySelectorAll(this.spath);
        for ( const node of nodes ) {
            output.push(node);
        }
    }
    // Helper method for other operators.
    static qsa(node, selector) {
        const parent = node.parentElement;
        if ( parent === null ) { return []; }
        let pos = 1;
        for (;;) {
            node = node.previousElementSibling;
            if ( node === null ) { break; }
            pos += 1;
        }
        return parent.querySelectorAll(
            `:scope > :nth-child(${pos})${selector}`
        );
    }
}

/******************************************************************************/

class PSelectorUpwardTask extends PSelectorTask {
    constructor(task) {
        super();
        const arg = task[1];
        if ( typeof arg === 'number' ) {
            this.i = arg;
        } else {
            this.s = arg;
        }
    }
    transpose(node, output) {
        if ( this.s !== '' ) {
            const parent = node.parentElement;
            if ( parent === null ) { return; }
            node = parent.closest(this.s);
            if ( node === null ) { return; }
        } else {
            let nth = this.i;
            for (;;) {
                node = node.parentElement;
                if ( node === null ) { return; }
                nth -= 1;
                if ( nth === 0 ) { break; }
            }
        }
        output.push(node);
    }
}
PSelectorUpwardTask.prototype.i = 0;
PSelectorUpwardTask.prototype.s = '';

/******************************************************************************/

class PSelectorWatchAttrs extends PSelectorTask {
    constructor(task) {
        super();
        this.observer = null;
        this.observed = new WeakSet();
        this.observerOptions = {
            attributes: true,
            subtree: true,
        };
        const attrs = task[1];
        if ( Array.isArray(attrs) && attrs.length !== 0 ) {
            this.observerOptions.attributeFilter = task[1];
        }
    }
    // TODO: Is it worth trying to re-apply only the current selector?
    handler() {
        if ( proceduralFilterer instanceof Object ) {
            proceduralFilterer.onDOMChanged([ null ]);
        }
    }
    transpose(node, output) {
        output.push(node);
        if ( this.observed.has(node) ) { return; }
        if ( this.observer === null ) {
            this.observer = new MutationObserver(this.handler);
        }
        this.observer.observe(node, this.observerOptions);
        this.observed.add(node);
    }
}

/******************************************************************************/

class PSelectorXpathTask extends PSelectorTask {
    constructor(task) {
        super();
        this.xpe = document.createExpression(task[1], null);
        this.xpr = null;
    }
    transpose(node, output) {
        this.xpr = this.xpe.evaluate(
            node,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            this.xpr
        );
        let j = this.xpr.snapshotLength;
        while ( j-- ) {
            const node = this.xpr.snapshotItem(j);
            if ( node.nodeType === 1 ) {
                output.push(node);
            }
        }
    }
}

/******************************************************************************/

class PSelector {
    constructor(o) {
        this.raw = o.raw;
        this.selector = o.selector;
        this.tasks = [];
        const tasks = [];
        if ( Array.isArray(o.tasks) === false ) { return; }
        for ( const task of o.tasks ) {
            const ctor = this.operatorToTaskMap.get(task[0]) || PSelectorVoidTask;
            tasks.push(new ctor(task));
        }
        this.tasks = tasks;
    }
    prime(input) {
        const root = input || document;
        if ( this.selector === '' ) { return [ root ]; }
        if ( input !== document ) {
            const c0 = this.selector.charCodeAt(0);
            if ( c0 === 0x2B /* + */ || c0 === 0x7E /* ~ */ ) {
                return Array.from(PSelectorSpathTask.qsa(input, this.selector));
            } else if ( c0 === 0x3E /* > */ ) {
                return Array.from(input.querySelectorAll(`:scope ${this.selector}`));
            }
        }
        return Array.from(root.querySelectorAll(this.selector));
    }
    exec(input) {
        let nodes = this.prime(input);
        for ( const task of this.tasks ) {
            if ( nodes.length === 0 ) { break; }
            const transposed = [];
            task.begin();
            for ( const node of nodes ) {
                task.transpose(node, transposed);
            }
            task.end(transposed);
            nodes = transposed;
        }
        return nodes;
    }
    test(input) {
        const nodes = this.prime(input);
        for ( const node of nodes ) {
            let output = [ node ];
            for ( const task of this.tasks ) {
                const transposed = [];
                task.begin();
                for ( const node of output ) {
                    task.transpose(node, transposed);
                }
                task.end(transposed);
                output = transposed;
                if ( output.length === 0 ) { break; }
            }
            if ( output.length !== 0 ) { return true; }
        }
        return false;
    }
}
PSelector.prototype.operatorToTaskMap = new Map([
    [ 'has', PSelectorIfTask ],
    [ 'has-text', PSelectorHasTextTask ],
    [ 'if', PSelectorIfTask ],
    [ 'if-not', PSelectorIfNotTask ],
    [ 'matches-attr', PSelectorMatchesAttrTask ],
    [ 'matches-css', PSelectorMatchesCSSTask ],
    [ 'matches-css-after', PSelectorMatchesCSSAfterTask ],
    [ 'matches-css-before', PSelectorMatchesCSSBeforeTask ],
    [ 'matches-media', PSelectorMatchesMediaTask ],
    [ 'matches-path', PSelectorMatchesPathTask ],
    [ 'min-text-length', PSelectorMinTextLengthTask ],
    [ 'not', PSelectorIfNotTask ],
    [ 'others', PSelectorOthersTask ],
    [ 'spath', PSelectorSpathTask ],
    [ 'upward', PSelectorUpwardTask ],
    [ 'watch-attr', PSelectorWatchAttrs ],
    [ 'xpath', PSelectorXpathTask ],
]);

/******************************************************************************/

class PSelectorRoot extends PSelector {
    constructor(o) {
        super(o);
        this.budget = 200; // I arbitrary picked a 1/5 second
        this.raw = o.raw;
        this.cost = 0;
        this.lastAllowanceTime = 0;
        this.action = o.action;
    }
    prime(input) {
        try {
            return super.prime(input);
        } catch (ex) {
        }
        return [];
    }
    exec(input) {
        try {
            return super.exec(input);
        } catch (ex) {
        }
        return [];
    }
}

/******************************************************************************/

class ProceduralFilterer {
    constructor(selectors) {
        this.selectors = [];
        this.masterToken = this.randomToken();
        this.styleTokenMap = new Map();
        this.styledNodes = new Set();
        this.timer = undefined;
        this.hideStyle = 'display:none!important;';
        this.addSelectors(selectors);
        // Important: commit now (do not go through onDOMChanged) to be sure
        // first pass is going to happen asap.
        this.uBOL_commitNow();
    }

    addSelectors() {
        for ( const selector of selectors ) {
            const pselector = new PSelectorRoot(selector);
            this.primeProceduralSelector(pselector);
            this.selectors.push(pselector);
        }
        this.onDOMChanged();
    }

    // This allows to perform potentially expensive initialization steps
    // before the filters are ready to be applied.
    primeProceduralSelector(pselector) {
        if ( pselector.action === undefined ) {
            this.styleTokenFromStyle(this.hideStyle);
        } else if ( pselector.action[0] === 'style' ) {
            this.styleTokenFromStyle(pselector.action[1]);
        }
        return pselector;
    }

    uBOL_commitNow() {
        // https://github.com/uBlockOrigin/uBlock-issues/issues/341
        //   Be ready to unhide nodes which no longer matches any of
        //   the procedural selectors.
        const toUnstyle = this.styledNodes;
        this.styledNodes = new Set();

        let t0 = Date.now();

        for ( const pselector of this.selectors.values() ) {
            const allowance = Math.floor((t0 - pselector.lastAllowanceTime) / 2000);
            if ( allowance >= 1 ) {
                pselector.budget += allowance * 50;
                if ( pselector.budget > 200 ) { pselector.budget = 200; }
                pselector.lastAllowanceTime = t0;
            }
            if ( pselector.budget <= 0 ) { continue; }
            const nodes = pselector.exec();
            const t1 = Date.now();
            pselector.budget += t0 - t1;
            if ( pselector.budget < -500 ) {
                console.info('uBOL: disabling %s', pselector.raw);
                pselector.budget = -0x7FFFFFFF;
            }
            t0 = t1;
            if ( nodes.length === 0 ) { continue; }
            this.processNodes(nodes, pselector.action);
        }

        this.unprocessNodes(toUnstyle);
    }

    styleTokenFromStyle(style) {
        if ( style === undefined ) { return; }
        let styleToken = this.styleTokenMap.get(style);
        if ( styleToken !== undefined ) { return styleToken; }
        styleToken = this.randomToken();
        this.styleTokenMap.set(style, styleToken);
        uBOL_injectCSS(`[${this.masterToken}][${styleToken}]\n{${style}}\n`);
        return styleToken;
    }

    processNodes(nodes, action) {
        const op = action && action[0] || '';
        const arg = op !== '' ? action[1] : '';
        switch ( op ) {
        case '':
            /* fall through */
        case 'style': {
            const styleToken = this.styleTokenFromStyle(
                arg === '' ? this.hideStyle : arg
            );
            for ( const node of nodes ) {
                node.setAttribute(this.masterToken, '');
                node.setAttribute(styleToken, '');
                this.styledNodes.add(node);
            }
            break;
        }
        case 'remove': {
            for ( const node of nodes ) {
                node.remove();
                node.textContent = '';
            }
            break;
        }
        case 'remove-attr': {
            const reAttr = regexFromString(arg, true);
            for ( const node of nodes ) {
                for ( const name of node.getAttributeNames() ) {
                    if ( reAttr.test(name) === false ) { continue; }
                    node.removeAttribute(name);
                }
            }
            break;
        }
        case 'remove-class': {
            const reClass = regexFromString(arg, true);
            for ( const node of nodes ) {
                const cl = node.classList;
                for ( const name of cl.values() ) {
                    if ( reClass.test(name) === false ) { continue; }
                    cl.remove(name);
                }
            }
            break;
        }
        default:
            break;
        }
    }

    // TODO: Current assumption is one style per hit element. Could be an
    //       issue if an element has multiple styling and one styling is
    //       brought back. Possibly too rare to care about this for now.
    unprocessNodes(nodes) {
        for ( const node of nodes ) {
            if ( this.styledNodes.has(node) ) { continue; }
            node.removeAttribute(this.masterToken);
        }
    }

    randomToken() {
        const n = Math.random();
        return String.fromCharCode(n * 25 + 97) +
            Math.floor(
                (0.25 + n * 0.75) * Number.MAX_SAFE_INTEGER
            ).toString(36).slice(-8);
    }

    onDOMChanged() {
        if ( this.timer !== undefined ) { return; }
        this.timer = self.requestAnimationFrame(( ) => {
            this.timer = undefined;
            this.uBOL_commitNow();
        });
    }
}

/******************************************************************************/

const proceduralFilterer = new ProceduralFilterer(selectors);

const observer = new MutationObserver(mutations => {
    let domChanged = false;
    for ( let i = 0; i < mutations.length && !domChanged; i++ ) {
        const mutation = mutations[i];
        for ( const added of mutation.addedNodes ) {
            if ( added.nodeType !== 1 ) { continue; }
            domChanged = true;
            break;
        }
        if ( domChanged === false ) {
            for ( const removed of mutation.removedNodes ) {
                if ( removed.nodeType !== 1 ) { continue; }
                domChanged = true;
                break;
            }
        }
    }
    if ( domChanged === false ) { return; }
    proceduralFilterer.onDOMChanged();
});

observer.observe(document, {
    childList: true,
    subtree: true,
});

/******************************************************************************/

})();

/******************************************************************************/

void 0;
