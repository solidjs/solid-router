import { createMemo, createContext, createSignal, untrack, onCleanup, createComponent, createRenderEffect, useContext, NotReadyError, isPending, runWithOwner, getOwner, createRoot, createEffect, flush, sharedConfig, action, getObserver } from 'solid-js';

const syncOptions = {
  sync: true
};
const memo = fn => createMemo(() => fn(), syncOptions);

const $$EVENT_OWNER = "_$DX_EVENT_OWNER";
const delegatedEvents = new Set();
const delegatedContainers = new Map();
function delegateEvents(eventNames) {
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!delegatedEvents.has(name)) {
      delegatedEvents.add(name);
      delegatedContainers.forEach((state, container) => attachDelegatedEvent(name, container, state));
    }
  }
}
function attachDelegatedEvent(name, container, state) {
  if (state.handlers.has(name)) return;
  const handler = e => eventHandler(e, container, state);
  state.handlers.set(name, handler);
  container.addEventListener(name, handler);
}
function findOwner(target, state) {
  let node = target;
  let distance = 0;
  while (node) {
    if (state.owners.has(node)) return {
      owner: node,
      distance
    };
    distance++;
    node = node._$host || node.parentNode || node.host;
  }
}
let claimHandlers = null;
const CLAIM_SEAM = Symbol.for("dom-expressions.element-claims");
function registerElementClaim(handler) {
  (claimHandlers || (claimHandlers = globalThis[CLAIM_SEAM] = [])).push(handler);
  return () => {
    const index = claimHandlers.indexOf(handler);
    index > -1 && claimHandlers.splice(index, 1);
  };
}
function eventHandler(e, container, state) {
  const prev = e[$$EVENT_OWNER];
  let resumeNode;
  if (prev) {
    if (prev === true || prev === container || !container.contains(prev)) return;
    resumeNode = prev;
  }
  const owner = state && (state.owners.size === 1 && state.owners.has(container) ? container : findOwner(e.target, state)?.owner);
  if (state && !owner) return;
  e[$$EVENT_OWNER] = owner || true;
  let node = resumeNode || e.target;
  const key = `$$${e.type}`;
  const oriTarget = e.target;
  const boundary = owner || container || e.currentTarget;
  const retarget = value => Object.defineProperty(e, "target", {
    configurable: true,
    value
  });
  const handleNode = () => {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
    return true;
  };
  const walkUpTree = () => {
    while (handleNode()) {
      if (node === boundary || node.parentNode === boundary) break;
      node = node._$host || node.parentNode || node.host;
    }
  };
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || boundary || document;
    }
  });
  if (resumeNode) {
    if (resumeNode === e.target) node = resumeNode._$host || resumeNode.parentNode || resumeNode.host;
    if (node && node !== boundary) walkUpTree();
  } else if (e.composedPath) {
    const path = e.composedPath();
    if (path.length) {
      retarget(path[0]);
      for (let i = 0; i < path.length; i++) {
        node = path[i];
        if (!handleNode()) break;
        if (node._$host) {
          node = node._$host;
          walkUpTree();
          break;
        }
        if (node === boundary || node.parentNode === boundary) {
          break;
        }
      }
    } else walkUpTree();
  }
  else walkUpTree();
  retarget(oriTarget);
}

const ENVELOPE = Symbol.for("solid.ResponseEnvelope");
function isResponseEnvelope(value) {
  return !!(value && typeof value === "object" && value[ENVELOPE]);
}
const REVALIDATE_HEADER$1 = "X-Revalidate";
const isServer = false;

var L=(i=>(i[i.AggregateError=1]="AggregateError",i[i.ArrowFunction=2]="ArrowFunction",i[i.ErrorPrototypeStack=4]="ErrorPrototypeStack",i[i.ObjectAssign=8]="ObjectAssign",i[i.BigIntTypedArray=16]="BigIntTypedArray",i[i.RegExp=32]="RegExp",i))(L||{});var v$1=Symbol.asyncIterator,dr=Symbol.hasInstance,R=Symbol.isConcatSpreadable,C$1=Symbol.iterator,gr=Symbol.match,yr=Symbol.matchAll,Nr=Symbol.replace,br=Symbol.search,vr=Symbol.species,Cr=Symbol.split,Ar=Symbol.toPrimitive,P$1=Symbol.toStringTag,Er=Symbol.unscopables;var ot={0:v$1,1:dr,2:R,3:C$1,4:gr,5:yr,6:Nr,7:br,8:vr,9:Cr,10:Ar,11:P$1,12:Er},o$1=void 0,st={2:!0,3:!1,1:o$1,0:null,4:-0,5:Number.POSITIVE_INFINITY,6:Number.NEGATIVE_INFINITY,7:Number.NaN};var it={0:Error,1:EvalError,2:RangeError,3:ReferenceError,4:SyntaxError,5:TypeError,6:URIError};function gn(e){switch(e){case"\\\\":return "\\";case'\\"':return '"';case"\\n":return `
`;case"\\r":return "\r";case"\\b":return "\b";case"\\t":return "	";case"\\f":return "\f";case"\\x3C":return "<";case"\\u2028":return "\u2028";case"\\u2029":return "\u2029";default:return e}}function h$1(e){return e.replace(/(\\\\|\\"|\\n|\\r|\\b|\\t|\\f|\\u2028|\\u2029|\\x3C)/g,gn)}var U$1="__SEROVAL_REFS__";var j$1=new Map;function bn(e){return j$1.has(e)}function mt(e){if(bn(e))return j$1.get(e);throw new xe(e)}typeof globalThis!="undefined"?Object.defineProperty(globalThis,U$1,{value:j$1,configurable:!0,writable:!1,enumerable:!1}):typeof window!="undefined"?Object.defineProperty(window,U$1,{value:j$1,configurable:!0,writable:!1,enumerable:!1}):typeof self!="undefined"?Object.defineProperty(self,U$1,{value:j$1,configurable:!0,writable:!1,enumerable:!1}):typeof global!="undefined"&&Object.defineProperty(global,U$1,{value:j$1,configurable:!0,writable:!1,enumerable:!1});var Cn={parsing:1,serialization:2,deserialization:3};function An(e){return `Seroval Error (step: ${Cn[e]})`}var En=(e,r)=>An(e),fe=class extends Error{constructor(t,n){super(En(t));this.cause=n;}},Je=class extends fe{constructor(r){super("deserialization",r);}};function k(e){return `Seroval Error (specific: ${e})`}var z=class extends Error{constructor(r){super(k(2));}},Q$1=class Q extends Error{constructor(r){super(k(3));}},V=class extends Error{constructor(r){super(k(4));}},xe=class extends Error{constructor(r){super(k(6));}},Ze=class extends Error{constructor(r){super(k(7));}},O$1=class O extends Error{constructor(r){super(k(8));}},M$1=class M extends Error{constructor(r){super(k(9));}};var ee$1=()=>{let e={p:0,s:0,f:0};return e.p=new Promise((r,t)=>{e.s=r,e.f=t;}),e},In=(e,r)=>{e.s(r),e.p.s=1,e.p.v=r;},Rn=(e,r)=>{e.f(r),e.p.s=2,e.p.v=r;};ee$1.toString();In.toString();Rn.toString();var xr=()=>{let e=[],r=[],t=!0,n=!1,a=0,s=(l,g,S)=>{for(S=0;S<a;S++)r[S]&&r[S][g](l);},i=(l,g,S,d)=>{for(g=0,S=e.length;g<S;g++)d=e[g],!t&&g===S-1?l[n?"return":"throw"](d):l.next(d);},u=(l,g)=>(t&&(g=a++,r[g]=l),i(l),()=>{t&&(r[g]=r[a],r[a--]=void 0);});return {__SEROVAL_STREAM__:!0,on:l=>u(l),next:l=>{t&&(e.push(l),s(l,"next"));},throw:l=>{t&&(e.push(l),s(l,"throw"),t=!1,n=!1,r.length=0);},return:l=>{t&&(e.push(l),s(l,"return"),t=!1,n=!0,r.length=0);}}},Tr=e=>r=>()=>{let t=0,n={[e]:()=>n,next:()=>{if(t>r.d)return {done:!0,value:void 0};let a=t++,s=r.v[a];if(a===r.t)throw s;return {done:a===r.d,value:s}}};return n},Or=(e,r)=>t=>()=>{let n=0,a=-1,s=!1,i=[],u=[],l=(S=0,d=u.length)=>{for(;S<d;S++)u[S].s({done:!0,value:void 0});};t.on({next:S=>{let d=u.shift();d&&d.s({done:!1,value:S}),i.push(S);},throw:S=>{let d=u.shift();d&&d.f(S),l(),a=i.length,s=!0,i.push(S);},return:S=>{let d=u.shift();d&&d.s({done:!0,value:S}),l(),a=i.length,i.push(S);}});let g={[e]:()=>g,next:()=>{if(a===-1){let G=n++;if(G>=i.length){let tt=r();return u.push(tt),tt.p}return {done:!1,value:i[G]}}if(n>a)return {done:!0,value:void 0};let S=n++,d=i[S];if(S!==a)return {done:!1,value:d};if(s)throw d;return {done:!0,value:d}}};return g},wr=e=>{let r=atob(e),t=r.length,n=new Uint8Array(t);for(let a=0;a<t;a++)n[a]=r.charCodeAt(a);return n.buffer};wr.toString();function hr(e,r,t){return {__SEROVAL_SEQUENCE__:!0,v:e,t:r,d:t}}var Pn=Tr(C$1);function Pt(e){return Pn(e)}function re$1(){return xr()}var xn=Or(v$1,ee$1);function ht(e){return xn(e)}var oe$1=(t=>(t[t.Vanilla=1]="Vanilla",t[t.Cross=2]="Cross",t))(oe$1||{});function ai(e){return e}function Ft(e,r){for(let t=0,n=r.length;t<n;t++){let a=r[t];e.has(a)||(e.add(a),a.extends&&Ft(e,a.extends));}}function A$1(e){if(e){let r=new Set;return Ft(r,e),[...r]}}function Bt(e){switch(e){case"Int8Array":return Int8Array;case"Int16Array":return Int16Array;case"Int32Array":return Int32Array;case"Uint8Array":return Uint8Array;case"Uint16Array":return Uint16Array;case"Uint32Array":return Uint32Array;case"Uint8ClampedArray":return Uint8ClampedArray;case"Float32Array":return Float32Array;case"Float64Array":return Float64Array;case"BigInt64Array":return BigInt64Array;case"BigUint64Array":return BigUint64Array;default:throw new Ze(e)}}function de$1(e){switch(e){case"constructor":case"__proto__":case"prototype":case"__defineGetter__":case"__defineSetter__":case"__lookupGetter__":case"__lookupSetter__":return !1;default:return !0}}function Vt(e){switch(e){case v$1:case R:case P$1:case C$1:return !0;default:return !1}}var qn=1e6,Wn=1e4,Kn=2e4;function Lt(e,r){switch(r){case 3:return Object.freeze(e);case 1:return Object.preventExtensions(e);case 2:return Object.seal(e);default:return e}}var Gn=1e3;function Ut(e,r){var n;let t=r.refs||new Map;return "types"in t||Object.assign(t,{types:new Map}),{mode:e,plugins:r.plugins,refs:t,features:(n=r.features)!=null?n:63^(r.disabledFeatures||0),depthLimit:r.depthLimit||Gn}}function Yt(e){return {mode:2,base:Ut(2,e),child:o$1}}var Br=class{constructor(r,t){this._p=r;this.depth=t;}deserialize(r){return p(this._p,this.depth,r)}};function qt(e,r){if(r<0||!Number.isFinite(r)||!Number.isInteger(r))throw new O$1({t:4,i:r});if(e.refs.has(r))throw new Error("Conflicted ref id: "+r)}function Hn(e,r,t){return qt(e.base,r),e.state.marked.has(r)&&e.base.refs.set(r,t),t}function Jn(e,r,t){return qt(e.base,r),e.base.refs.set(r,t),t}function b(e,r,t){return e.mode===1?Hn(e,r,t):Jn(e,r,t)}function Vr(e,r,t){if(Object.hasOwn(r,t))return r[t];throw new O$1(e)}function Zn(e,r){return b(e,r.i,mt(h$1(r.s)))}function $n(e,r,t){let n=t.a,a=n.length,s=b(e,t.i,new Array(a));for(let i=0,u;i<a;i++)u=n[i],u&&(s[i]=p(e,r,u));return Lt(s,t.o),s}function Mt(e,r,t){de$1(r)?e[r]=t:Object.defineProperty(e,r,{value:t,configurable:!0,enumerable:!0,writable:!0});}function Xn(e,r,t,n,a){if(typeof n=="string")Mt(t,h$1(n),p(e,r,a));else {let s=p(e,r,n);switch(typeof s){case"string":Mt(t,s,p(e,r,a));break;case"symbol":Vt(s)&&(t[s]=p(e,r,a));break;default:throw new O$1(n)}}}function Wt(e,r,t){e.base.refs.types.set(r,t);}function ge(e,r,t,n){if(e.base.refs.types.get(t)!==n)throw new O$1(r)}function Kt(e,r,t,n){let a=t.k;if(a.length>0)for(let i=0,u=t.v,l=a.length;i<l;i++)Xn(e,r,n,a[i],u[i]);return n}function Qn(e,r,t){let n=b(e,t.i,t.t===10?{}:Object.create(null));return Kt(e,r,t.p,n),Lt(n,t.o),n}function eo(e,r){return b(e,r.i,new Date(r.s))}function ro(e,r){if(e.base.features&32){let t=h$1(r.c);if(t.length>Kn)throw new O$1(r);return b(e,r.i,new RegExp(t,r.m))}throw new z(r)}function to(e,r,t){let n=b(e,t.i,new Set);for(let a=0,s=t.a,i=s.length;a<i;a++)n.add(p(e,r,s[a]));return n}function no(e,r,t){let n=b(e,t.i,new Map);for(let a=0,s=t.e.k,i=t.e.v,u=s.length;a<u;a++)n.set(p(e,r,s[a]),p(e,r,i[a]));return n}function oo(e,r){if(r.s.length>qn)throw new O$1(r);return b(e,r.i,wr(h$1(r.s)))}function ao(e,r,t){var u;let n=Bt(t.c),a=p(e,r,t.f),s=(u=t.b)!=null?u:0;if(s<0||s>a.byteLength)throw new O$1(t);return b(e,t.i,new n(a,s,t.l))}function so(e,r,t){var i;let n=p(e,r,t.f),a=(i=t.b)!=null?i:0;if(a<0||a>n.byteLength)throw new O$1(t);return b(e,t.i,new DataView(n,a,t.l))}function Gt(e,r,t,n){if(t.p){let a=Kt(e,r,t.p,{});Object.defineProperties(n,Object.getOwnPropertyDescriptors(a));}return n}function io(e,r,t){let n=b(e,t.i,new AggregateError([],h$1(t.m)));return Gt(e,r,t,n)}function uo(e,r,t){let n=Vr(t,it,t.s),a=b(e,t.i,new n(h$1(t.m)));return Gt(e,r,t,a)}function lo(e,r,t){let n=ee$1(),a=b(e,t.i,n.p),s=p(e,r,t.f);return t.s?n.s(s):n.f(s),a}function co(e,r,t){return b(e,t.i,Object(p(e,r,t.f)))}function fo(e,r,t){let n=e.base.plugins;if(n){let a=h$1(t.c);for(let s=0,i=n.length;s<i;s++){let u=n[s];if(u.tag===a)return b(e,t.i,u.deserialize(t.s,new Br(e,r),{id:t.i}))}}throw new Q$1(t.c)}function So(e,r){let t=b(e,r.i,b(e,r.s,ee$1()).p);return Wt(e,r.s,22),t}function mo(e,r,t){let n=e.base.refs.get(t.i);if(n)return ge(e,t,t.i,22),n.s(p(e,r,t.a[1])),o$1;throw new V("Promise")}function po(e,r,t){let n=e.base.refs.get(t.i);if(n)return ge(e,t,t.i,22),n.f(p(e,r,t.a[1])),o$1;throw new V("Promise")}function go(e,r,t){p(e,r,t.a[0]);let n=p(e,r,t.a[1]);return Pt(n)}function yo(e,r,t){p(e,r,t.a[0]);let n=p(e,r,t.a[1]);return ht(n)}function No(e,r,t){let n=b(e,t.i,re$1());Wt(e,t.i,31);let a=t.a,s=a.length;if(s)for(let i=0;i<s;i++)p(e,r,a[i]);return n}function bo(e,r,t){let n=e.base.refs.get(t.i);if(n)return ge(e,t,t.i,31),n.next(p(e,r,t.f)),o$1;throw new V("Stream")}function vo(e,r,t){let n=e.base.refs.get(t.i);if(n)return ge(e,t,t.i,31),n.throw(p(e,r,t.f)),o$1;throw new V("Stream")}function Co(e,r,t){let n=e.base.refs.get(t.i);if(n)return ge(e,t,t.i,31),n.return(p(e,r,t.f)),o$1;throw new V("Stream")}function Ao(e,r,t){return p(e,r,t.f),o$1}function Eo(e,r,t){return p(e,r,t.a[1]),o$1}function Io(e,r,t){let n=b(e,t.i,hr([],t.s,t.l));for(let a=0,s=t.a.length;a<s;a++)n.v[a]=p(e,r,t.a[a]);return n}function p(e,r,t){if(r>e.base.depthLimit)throw new M$1(e.base.depthLimit);switch(r+=1,t.t){case 2:return Vr(t,st,t.s);case 0:return Number(t.s);case 1:return h$1(String(t.s));case 3:if(String(t.s).length>Wn)throw new O$1(t);return BigInt(t.s);case 4:return e.base.refs.get(t.i);case 18:return Zn(e,t);case 9:return $n(e,r,t);case 10:case 11:return Qn(e,r,t);case 5:return eo(e,t);case 6:return ro(e,t);case 7:return to(e,r,t);case 8:return no(e,r,t);case 19:return oo(e,t);case 16:case 15:return ao(e,r,t);case 20:return so(e,r,t);case 14:return io(e,r,t);case 13:return uo(e,r,t);case 12:return lo(e,r,t);case 17:return Vr(t,ot,t.s);case 21:return co(e,r,t);case 25:return fo(e,r,t);case 22:return So(e,t);case 23:return mo(e,r,t);case 24:return po(e,r,t);case 28:return go(e,r,t);case 30:return yo(e,r,t);case 31:return No(e,r,t);case 32:return bo(e,r,t);case 33:return vo(e,r,t);case 34:return Co(e,r,t);case 27:return Ao(e,r,t);case 29:return Eo(e,r,t);case 35:return Io(e,r,t);default:throw new z(t)}}function ir(e,r){try{return p(e,0,r)}catch(t){throw new Je(t)}}var Ro=()=>T;Ro.toString();function fu(e,r){let t=A$1(r.plugins),n=Yt({plugins:t,refs:r.refs,features:r.features,disabledFeatures:r.disabledFeatures,depthLimit:r.depthLimit});return ir(n,e)}

var u=e=>{let r=new AbortController,a=r.abort.bind(r);return e.then(a,a),r};function D(e){e(this.reason);}function F(e){this.addEventListener("abort",D.bind(this,e),{once:!0});}function g(e){return new Promise(F.bind(e))}var n={},A=ai({tag:"seroval-plugins/web/AbortControllerFactoryPlugin",test(e){return e===n},parse:{sync(){return n},async async(){return await Promise.resolve(n)},stream(){return n}},serialize(){return u.toString()},deserialize(){return u}}),C=ai({tag:"seroval-plugins/web/AbortSignal",extends:[A],test(e){return typeof AbortSignal=="undefined"?!1:e instanceof AbortSignal},parse:{sync(e,r){return e.aborted?{reason:r.parse(e.reason)}:{}},async async(e,r){if(e.aborted)return {reason:await r.parse(e.reason)};let a=await g(e);return {reason:await r.parse(a)}},stream(e,r){if(e.aborted)return {reason:r.parse(e.reason)};let a=g(e);return {factory:r.parse(n),controller:r.parse(a)}}},serialize(e,r){return e.reason?"AbortSignal.abort("+r.serialize(e.reason)+")":e.controller&&e.factory?"("+r.serialize(e.factory)+")("+r.serialize(e.controller)+").signal":"(new AbortController).signal"},deserialize(e,r){return e.reason?AbortSignal.abort(r.deserialize(e.reason)):e.controller?u(r.deserialize(e.controller)).signal:new AbortController().signal}}),O=C;function d(e){return {detail:e.detail,bubbles:e.bubbles,cancelable:e.cancelable,composed:e.composed}}var U=ai({tag:"seroval-plugins/web/CustomEvent",test(e){return typeof CustomEvent=="undefined"?!1:e instanceof CustomEvent},parse:{sync(e,r){return {type:r.parse(e.type),options:r.parse(d(e))}},async async(e,r){return {type:await r.parse(e.type),options:await r.parse(d(e))}},stream(e,r){return {type:r.parse(e.type),options:r.parse(d(e))}}},serialize(e,r){return "new CustomEvent("+r.serialize(e.type)+","+r.serialize(e.options)+")"},deserialize(e,r){return new CustomEvent(r.deserialize(e.type),r.deserialize(e.options))}}),M=U;var q=ai({tag:"seroval-plugins/web/DOMException",test(e){return typeof DOMException=="undefined"?!1:e instanceof DOMException},parse:{sync(e,r){return {name:r.parse(e.name),message:r.parse(e.message)}},async async(e,r){return {name:await r.parse(e.name),message:await r.parse(e.message)}},stream(e,r){return {name:r.parse(e.name),message:r.parse(e.message)}}},serialize(e,r){return "new DOMException("+r.serialize(e.message)+","+r.serialize(e.name)+")"},deserialize(e,r){return new DOMException(r.deserialize(e.message),r.deserialize(e.name))}}),H=q;function f(e){return {bubbles:e.bubbles,cancelable:e.cancelable,composed:e.composed}}var Y=ai({tag:"seroval-plugins/web/Event",test(e){return typeof Event=="undefined"?!1:e instanceof Event},parse:{sync(e,r){return {type:r.parse(e.type),options:r.parse(f(e))}},async async(e,r){return {type:await r.parse(e.type),options:await r.parse(f(e))}},stream(e,r){return {type:r.parse(e.type),options:r.parse(f(e))}}},serialize(e,r){return "new Event("+r.serialize(e.type)+","+r.serialize(e.options)+")"},deserialize(e,r){return new Event(r.deserialize(e.type),r.deserialize(e.options))}}),j=Y;var G=ai({tag:"seroval-plugins/web/File",test(e){return typeof File=="undefined"?!1:e instanceof File},parse:{async async(e,r){return {name:await r.parse(e.name),options:await r.parse({type:e.type,lastModified:e.lastModified}),buffer:await r.parse(await e.arrayBuffer())}}},serialize(e,r){return "new File(["+r.serialize(e.buffer)+"],"+r.serialize(e.name)+","+r.serialize(e.options)+")"},deserialize(e,r){return new File([r.deserialize(e.buffer)],r.deserialize(e.name),r.deserialize(e.options))}}),m=G;function y(e){let r=[];return e.forEach((a,t)=>{r.push([t,a]);}),r}var s={},v=(e,r=new FormData,a=0,t=e.length,p)=>{for(;a<t;a++)p=e[a],r.append(p[0],p[1]);return r},J=ai({tag:"seroval-plugins/web/FormDataFactory",test(e){return e===s},parse:{sync(){return s},async async(){return await Promise.resolve(s)},stream(){return s}},serialize(){return v.toString()},deserialize(){return s}}),K=ai({tag:"seroval-plugins/web/FormData",extends:[m,J],test(e){return typeof FormData=="undefined"?!1:e instanceof FormData},parse:{sync(e,r){return {factory:r.parse(s),entries:r.parse(y(e))}},async async(e,r){return {factory:await r.parse(s),entries:await r.parse(y(e))}},stream(e,r){return {factory:r.parse(s),entries:r.parse(y(e))}}},serialize(e,r){return "("+r.serialize(e.factory)+")("+r.serialize(e.entries)+")"},deserialize(e,r){return v(r.deserialize(e.entries))}}),Q=K;function c(e){let r=[];return e.forEach((a,t)=>{r.push([t,a]);}),r}var X=ai({tag:"seroval-plugins/web/Headers",test(e){return typeof Headers=="undefined"?!1:e instanceof Headers},parse:{sync(e,r){return {value:r.parse(c(e))}},async async(e,r){return {value:await r.parse(c(e))}},stream(e,r){return {value:r.parse(c(e))}}},serialize(e,r){return "new Headers("+r.serialize(e.value)+")"},deserialize(e,r){return new Headers(r.deserialize(e.value))}}),i=X;var o={},P=e=>new ReadableStream({start:r=>{e.on({next:a=>{try{r.enqueue(a);}catch(t){}},throw:a=>{r.error(a);},return:()=>{try{r.close();}catch(a){}}});}}),ee=ai({tag:"seroval-plugins/web/ReadableStreamFactory",test(e){return e===o},parse:{sync(){return o},async async(){return await Promise.resolve(o)},stream(){return o}},serialize(){return P.toString()},deserialize(){return o}});async function N(e,r){try{let a=await r.read();a.done?(e.return(a.value),r.releaseLock()):(e.next(a.value),await N(e,r));}catch(a){e.throw(a);}}function re(e){e.cancel().catch(()=>{}),e.releaseLock();}function w(e){let r=re$1(),a=e.getReader(),t=re.bind(null,a);return N(r,a).catch(t),[r,t]}var ae=ai({tag:"seroval/plugins/web/ReadableStream",extends:[ee],test(e){return typeof ReadableStream=="undefined"?!1:e instanceof ReadableStream},parse:{sync(e,r){return {factory:r.parse(o),stream:r.parse(re$1())}},async async(e,r){return {factory:await r.parse(o),stream:await r.parse(w(e)[0])}},stream(e,r){let[a,t]=w(e);return r.addCleanup(t),{factory:r.parse(o),stream:r.parse(a)}}},serialize(e,r){return "("+r.serialize(e.factory)+")("+r.serialize(e.stream)+")"},deserialize(e,r){let a=r.deserialize(e.stream);return P(a)}}),l=ae;function h(e,r){return {body:r,cache:e.cache,credentials:e.credentials,headers:e.headers,integrity:e.integrity,keepalive:e.keepalive,method:e.method,mode:e.mode,redirect:e.redirect,referrer:e.referrer,referrerPolicy:e.referrerPolicy}}var se=ai({tag:"seroval-plugins/web/Request",extends:[l,i],test(e){return typeof Request=="undefined"?!1:e instanceof Request},parse:{async async(e,r){return {url:await r.parse(e.url),options:await r.parse(h(e,e.body&&!e.bodyUsed?await e.clone().arrayBuffer():null))}},stream(e,r){return {url:r.parse(e.url),options:r.parse(h(e,e.body&&!e.bodyUsed?e.clone().body:null))}}},serialize(e,r){return "new Request("+r.serialize(e.url)+","+r.serialize(e.options)+")"},deserialize(e,r){return new Request(r.deserialize(e.url),r.deserialize(e.options))}}),oe=se;function E(e){return {headers:e.headers,status:e.status,statusText:e.statusText}}var ie=ai({tag:"seroval-plugins/web/Response",extends:[l,i],test(e){return typeof Response=="undefined"?!1:e instanceof Response},parse:{async async(e,r){return {body:await r.parse(e.body&&!e.bodyUsed?await e.clone().arrayBuffer():null),options:await r.parse(E(e))}},stream(e,r){return {body:r.parse(e.body&&!e.bodyUsed?e.clone().body:null),options:r.parse(E(e))}}},serialize(e,r){return "new Response("+r.serialize(e.body)+","+r.serialize(e.options)+")"},deserialize(e,r){return new Response(r.deserialize(e.body),r.deserialize(e.options))}}),le=ie;var ue=ai({tag:"seroval-plugins/web/URL",test(e){return typeof URL=="undefined"?!1:e instanceof URL},parse:{sync(e,r){return {value:r.parse(e.href)}},async async(e,r){return {value:await r.parse(e.href)}},stream(e,r){return {value:r.parse(e.href)}}},serialize(e,r){return "new URL("+r.serialize(e.value)+")"},deserialize(e,r){return new URL(r.deserialize(e.value))}}),de=ue;var me=ai({tag:"seroval-plugins/web/URLSearchParams",test(e){return typeof URLSearchParams=="undefined"?!1:e instanceof URLSearchParams},parse:{sync(e,r){return {value:r.parse(e.toString())}},async async(e,r){return {value:await r.parse(e.toString())}},stream(e,r){return {value:r.parse(e.toString())}}},serialize(e,r){return "new URLSearchParams("+r.serialize(e.value)+")"},deserialize(e,r){return new URLSearchParams(r.deserialize(e.value))}}),ye=me;

const REVALIDATE_HEADER = "X-Revalidate";

L.AggregateError | L.BigIntTypedArray;
const DEFAULT_WEB_PLUGINS = Object.freeze([O,
M, H, j,
Q, i, l, oe, le, ye, de]);
function resolveSerializerPlugins(customPlugins) {
  return customPlugins ? [...customPlugins, ...DEFAULT_WEB_PLUGINS] : [...DEFAULT_WEB_PLUGINS];
}
const JSON_CODEC_DISABLED_FEATURES = L.RegExp;
const JSON_CODEC_DEPTH_LIMIT = 64;
function resolveCodecOptions({
  plugins,
  disabledFeatures,
  depthLimit
} = {}) {
  return {
    plugins: resolveSerializerPlugins(plugins),
    disabledFeatures: disabledFeatures === undefined ? JSON_CODEC_DISABLED_FEATURES : disabledFeatures,
    depthLimit: depthLimit === undefined ? JSON_CODEC_DEPTH_LIMIT : depthLimit
  };
}
function createJSONDeserializer(options) {
  const refs = new Map();
  const resolved = resolveCodecOptions(options);
  return function deserializeJSONChunk(node) {
    return fu(node, {
      refs,
      ...resolved
    });
  };
}

const codecConfig = {
  codec: undefined
};
const flightConfig = {
  consumer: undefined
};
function subscribeFlightData(consumer) {
  flightConfig.consumer = consumer;
  return () => {
    if (flightConfig.consumer === consumer) flightConfig.consumer = undefined;
  };
}
function getFlightDataConsumer() {
  return flightConfig.consumer;
}
const SERVER_FUNCTION_METADATA = Symbol.for("solid.ServerFunctionMetadata");
function getServerFunctionMetadata(fn) {
  if (typeof fn !== "function") return undefined;
  return fn[SERVER_FUNCTION_METADATA] || undefined;
}
function isServerFunction(fn) {
  return typeof fn === "function" && !!fn[SERVER_FUNCTION_METADATA];
}
function withMeta(fn, meta) {
  const metadata = getServerFunctionMetadata(fn);
  if (!metadata) {
    throw new Error("withMeta expects a server function reference");
  }
  Object.assign(metadata, meta);
  return fn;
}
const FUNCTION_HEADER = "X-Server-Function-Id";
const ERROR_HEADER = "X-Server-Function-Error";
const INSTANCE_HEADER = "X-Server-Function-Instance";
const BODY_FORMAT_HEADER = "X-Server-Function-Format";
const SINGLE_FLIGHT_HEADER = "X-Single-Flight";
const FILE_FORM_KEY = "__server_function_file__";
const BodyFormat = {
  Serialized: "0",
  String: "1",
  FormData: "2",
  URLSearchParams: "3",
  Blob: "4",
  File: "5",
  ArrayBuffer: "6",
  Uint8Array: "7",
  Json: "8"
};
function getHeadersAndBody(body) {
  switch (true) {
    case typeof body === "string":
      return {
        headers: {
          "Content-Type": "text/plain",
          [BODY_FORMAT_HEADER]: BodyFormat.String
        },
        body
      };
    case body instanceof FormData:
      return {
        headers: {
          [BODY_FORMAT_HEADER]: BodyFormat.FormData
        },
        body
      };
    case body instanceof URLSearchParams:
      return {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          [BODY_FORMAT_HEADER]: BodyFormat.URLSearchParams
        },
        body
      };
    case typeof File !== "undefined" && body instanceof File:
      {
        const formData = new FormData();
        formData.append(FILE_FORM_KEY, body, body.name);
        return {
          headers: {
            [BODY_FORMAT_HEADER]: BodyFormat.File
          },
          body: formData
        };
      }
    case body instanceof Blob:
      return {
        headers: {
          [BODY_FORMAT_HEADER]: BodyFormat.Blob
        },
        body
      };
    case body instanceof ArrayBuffer:
      return {
        headers: {
          [BODY_FORMAT_HEADER]: BodyFormat.ArrayBuffer
        },
        body
      };
    case body instanceof Uint8Array:
      return {
        headers: {
          [BODY_FORMAT_HEADER]: BodyFormat.Uint8Array
        },
        body: new Uint8Array(body)
      };
    default:
      return undefined;
  }
}
async function extractBody(source, codecOptions) {
  const contentType = source.headers.get("content-type");
  const format = source.headers.get(BODY_FORMAT_HEADER);
  const clone = source.clone();
  switch (true) {
    case format === BodyFormat.Serialized:
      return await deserializeStream(clone, codecOptions);
    case format === BodyFormat.Json:
      return JSON.parse(await clone.text());
    case format === BodyFormat.String:
      return await clone.text();
    case format === BodyFormat.File:
      {
        const formData = await clone.formData();
        return formData.get(FILE_FORM_KEY);
      }
    case format === BodyFormat.FormData:
    case contentType && contentType.startsWith("multipart/form-data"):
      return await clone.formData();
    case format === BodyFormat.URLSearchParams:
    case contentType && contentType.startsWith("application/x-www-form-urlencoded"):
      return new URLSearchParams(await clone.text());
    case format === BodyFormat.Blob:
      return await clone.blob();
    case format === BodyFormat.ArrayBuffer:
      return await clone.arrayBuffer();
    case format === BodyFormat.Uint8Array:
      return new Uint8Array(await clone.arrayBuffer());
  }
  return undefined;
}
class ChunkReader {
  constructor(stream) {
    this.reader = stream.getReader();
    this.buffer = new Uint8Array(0);
    this.done = false;
  }
  async readChunk() {
    const chunk = await this.reader.read();
    if (!chunk.done) {
      const newBuffer = new Uint8Array(this.buffer.length + chunk.value.length);
      newBuffer.set(this.buffer);
      newBuffer.set(chunk.value, this.buffer.length);
      this.buffer = newBuffer;
    } else {
      this.done = true;
    }
  }
  async next() {
    while (this.buffer.length < 12) {
      if (this.done) {
        if (this.buffer.length === 0) return {
          done: true,
          value: undefined
        };
        throw new Error("Malformed server function stream.");
      }
      await this.readChunk();
    }
    const head = new TextDecoder().decode(this.buffer.subarray(1, 11));
    const bytes = Number.parseInt(head, 16);
    if (Number.isNaN(bytes)) {
      throw new Error("Malformed server function stream.");
    }
    while (bytes > this.buffer.length - 12) {
      if (this.done) {
        throw new Error("Malformed server function stream.");
      }
      await this.readChunk();
    }
    const partial = new TextDecoder().decode(this.buffer.subarray(12, 12 + bytes));
    this.buffer = this.buffer.subarray(12 + bytes);
    return {
      done: false,
      value: partial
    };
  }
  async drain(interpret) {
    while (true) {
      const result = await this.next();
      if (result.done) {
        break;
      }
      interpret(result.value);
    }
  }
}
async function deserializeStream(source, codecOptions) {
  if (!source.body) {
    throw new Error("missing body");
  }
  const reader = new ChunkReader(source.body);
  const result = await reader.next();
  if (!result.done) {
    const deserializeChunk = createJSONDeserializer(codecOptions);
    function interpretChunk(chunk) {
      return deserializeChunk(JSON.parse(chunk));
    }
    void reader.drain(interpretChunk);
    return interpretChunk(result.value);
  }
  return undefined;
}
async function decodeResponse(response, codecOptions) {
  if (!response.body) return undefined;
  return await extractBody(response, codecConfig.codec );
}

const config = {
  endpoint: "/_server",
  prepareRequest: undefined,
  responseHandler: undefined,
  serializeArgs: undefined
};
function isJSONSafe(value) {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "boolean") return true;
  if (t === "number") return Number.isFinite(value);
  if (t !== "object") return false;
  if (Array.isArray(value)) {
    for (const v of value) if (!isJSONSafe(v)) return false;
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const k in value) if (!isJSONSafe(value[k])) return false;
  return true;
}
function serializeArguments(args) {
  {
    throw new Error("Server function arguments are sent as JSON by default and these " + "arguments are not JSON-serializable. Call enableRichArguments() " + "(from the server-functions rich-args entry) once at startup to " + "send Dates, Maps, Sets, typed arrays, etc. through the codec — or " + "pass a single Blob/FormData/File argument, which has a native " + "HTTP encoding.");
  }
}
let INSTANCE = 0;
async function createRequest(base, id, instance, options, meta) {
  const headers = {
    ...options.headers,
    [FUNCTION_HEADER]: id,
    [INSTANCE_HEADER]: instance
  };
  if (getFlightDataConsumer() && (!options.method || options.method.toUpperCase() !== "GET")) {
    headers[SINGLE_FLIGHT_HEADER] = "true";
  }
  let init = {
    method: "POST",
    ...options,
    headers
  };
  return fetch(base, init);
}
async function initializeResponse(base, id, instance, options, args, meta) {
  if (args.length === 0) {
    return createRequest(base, id, instance, options);
  }
  if (args.length === 1) {
    const result = getHeadersAndBody(args[0]);
    if (result) {
      return createRequest(base, id, instance, {
        ...options,
        body: result.body,
        headers: {
          ...options.headers,
          ...result.headers
        }
      });
    }
  }
  if (isJSONSafe(args)) {
    return createRequest(base, id, instance, {
      ...options,
      body: JSON.stringify(args),
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        [BODY_FORMAT_HEADER]: BodyFormat.Json
      }
    });
  }
  return createRequest(base, id, instance, {
    ...options,
    body: await serializeArguments(),
    headers: {
      ...options.headers,
      "Content-Type": "text/plain",
      [BODY_FORMAT_HEADER]: BodyFormat.Serialized
    }
  });
}
async function fetchServerFunction(base, id, options, args, meta) {
  const instance = `server-function:${INSTANCE++}`;
  const response = await initializeResponse(base, id, instance, options, args);
  if (response.headers.has(SINGLE_FLIGHT_HEADER)) {
    const consumer = getFlightDataConsumer();
    if (consumer) {
      const payload = await decodeResponse(response);
      await consumer(payload.data, {
        response
      });
      if (response.headers.has(ERROR_HEADER) && !response.headers.has("Location") && !response.headers.has(REVALIDATE_HEADER)) {
        throw payload.value;
      }
      return payload.value;
    }
  }
  if (response.headers.has("Location") || response.headers.has(REVALIDATE_HEADER) || response.headers.has(SINGLE_FLIGHT_HEADER)) {
    return response;
  }
  const result = await decodeResponse(response.clone());
  if (response.headers.has(ERROR_HEADER)) {
    throw result;
  }
  return result;
}
function createServerReference(id, name, base) {
  const metadata = {} ;
  const fn = (...args) => {
    return fetchServerFunction(base || config.endpoint, id, {}, args);
  };
  fn[SERVER_FUNCTION_METADATA] = metadata;
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === "id") return id;
      if (prop === "url") {
        return base || `${config.endpoint}?id=${encodeURIComponent(id)}`;
      }
      return target[prop];
    }
  });
}
function GET(fn) {
  if (!isServerFunction(fn)) {
    throw new Error("GET expects a server function reference");
  }
  const id = fn.id;
  const metadata = {
    ...getServerFunctionMetadata(fn)
  };
  const wrapped = async (...args) => {
    let base = `${config.endpoint}?id=${encodeURIComponent(id)}`;
    if (args.length) {
      const encoded = isJSONSafe(args) ? JSON.stringify(args) : await serializeArguments();
      base += `&args=${encodeURIComponent(encoded)}`;
    }
    return fetchServerFunction(base, id, {
      method: "GET"
    }, []);
  };
  wrapped[SERVER_FUNCTION_METADATA] = metadata;
  wrapped.id = id;
  Object.defineProperty(wrapped, "url", {
    get: () => `${config.endpoint}?id=${encodeURIComponent(id)}`,
    configurable: true
  });
  return withMeta(wrapped, {
    method: "GET"
  });
}

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|(\/)\/+$/g;
const mockBase = "http://sr";
function normalizePath(path, omitSlash = false) {
  const s = path.replace(trimPathRegex, "$1");
  return s ? omitSlash || /^[?#]/.test(s) ? s : "/" + s : "";
}

/** Pathname stripped of search/hash and trailing slash, lowercased — the form link matching compares. */
const comparablePath = path => normalizePath(path.split(/[?#]/, 1)[0]).toLowerCase().replace(/\/$/, "");
function resolvePath(base, path, from) {
  if (hasSchemeRegex.test(path)) {
    return undefined;
  }
  const basePath = normalizePath(base);
  const fromPath = from && normalizePath(from);
  let result = "";
  if (!fromPath || path.startsWith("/")) {
    result = basePath;
  } else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
    result = basePath + fromPath;
  } else {
    result = fromPath;
  }
  return (result || "/") + normalizePath(path, !result);
}
function invariant(value, message) {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}
function joinPaths(from, to) {
  return normalizePath(from).replace(/\/*(\*.*)?$/g, "") + normalizePath(to);
}
function extractSearchParams(url) {
  const params = {};
  url.searchParams.forEach((value, key) => {
    if (key in params) {
      if (Array.isArray(params[key])) params[key].push(value);else params[key] = [params[key], value];
    } else params[key] = value;
  });
  return params;
}
function createMatcher(path, partial, matchFilters) {
  const [pattern, splat] = path.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  const len = segments.length;
  return location => {
    const locSegments = location.split("/");
    // tolerate a single leading and trailing slash, but reject empty interior
    // segments so `/foo//bar` doesn't silently match `/foo/bar` (#567)
    if (locSegments[0] === "") locSegments.shift();
    if (locSegments.length && locSegments[locSegments.length - 1] === "") locSegments.pop();
    if (locSegments.includes("")) return null;
    const lenDiff = locSegments.length - len;
    if (lenDiff < 0 || lenDiff > 0 && splat === undefined && !partial) {
      return null;
    }
    const match = {
      path: len ? "" : "/",
      params: {}
    };
    const matchFilter = s => matchFilters === undefined ? undefined : matchFilters[s];
    for (let i = 0; i < len; i++) {
      const segment = segments[i];
      const dynamic = segment[0] === ":";
      const locSegment = dynamic ? locSegments[i] : locSegments[i].toLowerCase();
      const key = dynamic ? segment.slice(1) : segment.toLowerCase();
      if (dynamic && matchSegment(locSegment, matchFilter(key))) {
        match.params[key] = locSegment;
      } else if (dynamic || !matchSegment(locSegment, key)) {
        return null;
      }
      match.path += `/${locSegment}`;
    }
    if (splat) {
      const remainder = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
      if (matchSegment(remainder, matchFilter(splat))) {
        match.params[splat] = remainder;
      } else {
        return null;
      }
    }
    return match;
  };
}
function matchSegment(input, filter) {
  const isEqual = s => s === input;
  if (filter === undefined) {
    return true;
  } else if (typeof filter === "string") {
    return isEqual(filter);
  } else if (typeof filter === "function") {
    return filter(input);
  } else if (Array.isArray(filter)) {
    return filter.some(isEqual);
  } else if (filter instanceof RegExp) {
    return filter.test(input);
  }
  return false;
}
function scoreRoute(route) {
  const [pattern, splat] = route.pattern.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce((score, segment) => score + (segment.startsWith(":") ? 2 : 3), segments.length - (splat === undefined ? 0 : 1));
}
function createMemoObject(fn) {
  const map = new Map();
  const owner = getOwner();
  return new Proxy({}, {
    get(_, property) {
      if (!map.has(property)) {
        runWithOwner(owner, () => map.set(property, createMemo(() => fn()[property])));
      }
      return map.get(property)();
    },
    getOwnPropertyDescriptor() {
      return {
        enumerable: true,
        configurable: true
      };
    },
    ownKeys() {
      return Reflect.ownKeys(fn());
    },
    has(_, property) {
      return property in fn();
    }
  });
}
function mergeSearchString(search, params) {
  const merged = new URLSearchParams(search);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || value instanceof Array && !value.length) {
      merged.delete(key);
    } else {
      if (value instanceof Array) {
        // Delete all instances of the key before appending
        merged.delete(key);
        value.forEach(v => {
          merged.append(key, String(v));
        });
      } else {
        merged.set(key, String(value));
      }
    }
  });
  const s = merged.toString();
  return s ? `?${s}` : "";
}
function expandOptionals(pattern) {
  let match = /(\/?\:[^\/]+)\?/.exec(pattern);
  if (!match) return [pattern];
  let prefix = pattern.slice(0, match.index);
  let suffix = pattern.slice(match.index + match[0].length);
  const prefixes = [prefix, prefix += match[1]];

  // This section handles adjacent optional params. We don't actually want all permuations since
  // that will lead to equivalent routes which have the same number of params. For example
  // `/:a?/:b?/:c`? only has the unique expansion: `/`, `/:a`, `/:a/:b`, `/:a/:b/:c` and we can
  // discard `/:b`, `/:c`, `/:b/:c` by building them up in order and not recursing. This also helps
  // ensure predictability where earlier params have precidence.
  while (match = /^(\/\:[^\/]+)\?/.exec(suffix)) {
    prefixes.push(prefix += match[1]);
    suffix = suffix.slice(match[0].length);
  }
  return expandOptionals(suffix).reduce((results, expansion) => [...results, ...prefixes.map(p => p + expansion)], []);
}
function setFunctionName(obj, value) {
  Object.defineProperty(obj, "name", {
    value,
    writable: false,
    configurable: false
  });
  return obj;
}

/**
 * The compiler claims every `a[href]` (and `form[action]`, which this handler
 * ignores) at creation, and the runtime re-claims on `href` writes. This
 * consumer gives each router-managed anchor the link-state vocabulary without
 * a wrapper component:
 *
 * - `aria-current="page"` — the location matches the link exactly
 * - `data-active` — exact or prefix match
 * - `data-pending` — the link is the target of an in-flight navigation
 *
 * Elements are claimed at creation, so late mounts (`<Show>`, `<For>`,
 * portals) are correct immediately. One render effect (owned by the router)
 * subscribes to the location and sweeps a registry of claimed anchors —
 * anchors themselves carry no reactive machinery, just a registry entry
 * removed by their creating owner's cleanup. State is applied once at claim
 * so it is correct before the next navigation; re-claims (an `href` write)
 * are the same one-shot untracked refresh, reading the element's current
 * `href` from the DOM.
 */
function setupLinkClaims(router, explicitLinks) {
  const basePath = router.base.path();
  // per-element record; `current` remembers whether we set `aria-current`,
  // so user-authored values (steppers, breadcrumbs) are never stripped
  const claimed = new WeakMap();
  const registry = new Set();
  function isSvg(el) {
    return el.namespaceURI === "http://www.w3.org/2000/svg";
  }

  /** The comparable pathname when the router manages this anchor, else `undefined`. */
  function managedPath(a) {
    if (explicitLinks && !a.hasAttribute("link")) return;
    const svg = isSvg(a);
    // claims fire at creation while the element is still in the template's
    // inert fragment, where the `href` property is not resolved — resolve the
    // raw attribute against the live document instead
    const href = svg ? a.href.baseVal : a.getAttribute("href");
    const target = svg ? a.target.baseVal : a.target;
    if (target || !href) return;
    const rel = (a.getAttribute("rel") || "").split(/\s+/);
    if (a.hasAttribute("download") || rel.includes("external")) return;
    let url;
    try {
      url = new URL(href, document.baseURI);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin || basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())) return;
    return comparablePath(url.pathname);
  }
  function linkState(a) {
    // read reactive sources unconditionally so the owning effect stays
    // subscribed even while the anchor is not router-managed
    const loc = decodeURI(comparablePath(router.location.pathname));
    const routing = router.isRouting();
    const path = managedPath(a);
    // the root path is a prefix of everything, so it only matches exactly —
    // there is no per-anchor `end` opt-out like useLinkState has
    const matches = target => path !== undefined && (target === path || path !== "" && target.startsWith(path + "/"));
    // effects observe the committed location during a transition, so the
    // in-flight target comes from pendingTarget — readable here because the
    // isRouting write flushes after the target is assigned
    const pending = routing && !!router.pendingTarget && matches(decodeURI(comparablePath(router.pendingTarget.value)));
    return {
      active: matches(loc),
      pending,
      exact: path !== undefined && loc === path
    };
  }
  function apply(a, rec, {
    active,
    pending,
    exact
  }) {
    active ? a.setAttribute("data-active", "") : a.removeAttribute("data-active");
    pending ? a.setAttribute("data-pending", "") : a.removeAttribute("data-pending");
    if (exact !== rec.current) {
      exact ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
      rec.current = exact;
    }
  }
  const refresh = (a, rec) => untrack(() => apply(a, rec, linkState(a)));

  // The one subscription for every anchor: compute tracks the sources
  // linkState derives from (the in-flight pendingTarget is readable in the
  // effect phase because the isRouting write flushes after the target is
  // assigned), the effect phase sweeps the registry untracked.
  //
  // `transparent` keeps the effect invisible to the hydration id scheme.
  // This setup is client-only, so an id-consuming node here has no server
  // counterpart and every subsequent hydration id would shift by one child
  // slot — lazy-route lookups miss and hydration leaves server nodes
  // unclaimed. (The option is honored by the runtime but missing from the
  // published EffectOptions type, hence the cast.)
  createRenderEffect(() => (router.location.pathname, router.isRouting()), () => registry.forEach(a => refresh(a, claimed.get(a))), {
    transparent: true
  });
  onCleanup(registerElementClaim(node => {
    if (node.nodeName.toUpperCase() !== "A") return;
    const a = node;
    // re-claim (href changed): the claiming write runs inside another
    // effect, so refresh without leaking subscriptions into it
    const existing = claimed.get(a);
    if (existing) return refresh(a, existing);
    const rec = {
      current: false
    };
    claimed.set(a, rec);
    // claims fire during component setup, so an owner is present in
    // practice to bound the registry entry's lifetime; without one, state
    // is still applied once at creation
    if (getOwner()) {
      registry.add(a);
      onCleanup(() => registry.delete(a));
    }
    refresh(a, rec);
  }));
}

/**
 * The submit delegation consults this slot instead of importing the action
 * module: the action side installs its handler on first action creation
 * (see data/action.ts), so an app that never creates an action never pulls
 * the data layer into its bundle through the router's event wiring.
 */

let formHandler;
function setRouterFormHandler(handler) {
  formHandler = handler;
}
function setupNativeEvents({
  preload = true,
  explicitLinks = false,
  actionBase = "/_server",
  transformUrl
} = {}) {
  return router => {
    const basePath = router.base.path();
    const navigateFromRoute = router.navigatorFactory(router.base);
    let preloadTimeout;
    let lastElement;
    function isSvg(el) {
      return el.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function handleAnchor(evt) {
      if (evt.defaultPrevented || evt.button !== 0 || evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey) return;
      const a = evt.composedPath().find(el => el instanceof Node && el.nodeName.toUpperCase() === "A");
      if (!a || explicitLinks && !a.hasAttribute("link")) return;
      const svg = isSvg(a);
      const href = svg ? a.href.baseVal : a.href;
      const target = svg ? a.target.baseVal : a.target;
      if (target || !href && !a.hasAttribute("state")) return;
      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || rel && rel.includes("external")) return;
      const url = svg ? new URL(href, document.baseURI) : new URL(href);
      if (url.origin !== window.location.origin || basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())) return;
      return [a, url];
    }
    function handleAnchorClick(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
      const [a, url] = res;
      const to = router.parsePath(url.pathname + url.search + url.hash);
      const state = a.getAttribute("state");
      evt.preventDefault();
      navigateFromRoute(to, {
        resolve: false,
        replace: a.hasAttribute("replace"),
        scroll: !a.hasAttribute("noscroll"),
        state: state ? JSON.parse(state) : undefined
      });
    }
    function handleAnchorPreload(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
      const [a, url] = res;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      router.preloadRoute(url, a.getAttribute("preload") !== "false");
    }
    function handleAnchorMove(evt) {
      clearTimeout(preloadTimeout);
      const res = handleAnchor(evt);
      if (!res) return lastElement = null;
      const [a, url] = res;
      if (lastElement === a) return;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      preloadTimeout = setTimeout(() => {
        router.preloadRoute(url, a.getAttribute("preload") !== "false");
        lastElement = a;
      }, 20);
    }
    function handleFormSubmit(evt) {
      if (formHandler) return formHandler(evt, router, actionBase);
      // No form handler means no action module in the client graph at all
      // (e.g. server components binding forms straight to server functions).
      // A POST to a url under actionBase is self-describing, so delegation
      // is still sufficient: intercept synchronously — the no-JS treatment
      // is reserved for clients with no JS — capture the FormData, and load
      // the handler lazily. Apps that never submit one never load it.
      if (evt.defaultPrevented) return;
      const form = evt.target;
      const ref = evt.submitter && evt.submitter.hasAttribute("formaction") ? evt.submitter.getAttribute("formaction") : form.getAttribute("action");
      if (!ref || ref.startsWith("https://action/")) return;
      const url = new URL(ref, document.baseURI);
      const path = router.parsePath(url.pathname + url.search);
      if (!path.startsWith(actionBase) || form.method.toUpperCase() !== "POST") return;
      evt.preventDefault();
      const data = new FormData(form, evt.submitter);
      Promise.resolve().then(function () { return serverForms; }).then(m => m.submitServerForm(router, path, form, data));
    }

    // ensure delegated event run first
    delegateEvents(["click", "submit"]);
    document.addEventListener("click", handleAnchorClick);
    if (preload) {
      document.addEventListener("mousemove", handleAnchorMove, {
        passive: true
      });
      document.addEventListener("focusin", handleAnchorPreload, {
        passive: true
      });
      document.addEventListener("touchstart", handleAnchorPreload, {
        passive: true
      });
    }
    document.addEventListener("submit", handleFormSubmit);
    onCleanup(() => {
      document.removeEventListener("click", handleAnchorClick);
      if (preload) {
        document.removeEventListener("mousemove", handleAnchorMove);
        document.removeEventListener("focusin", handleAnchorPreload);
        document.removeEventListener("touchstart", handleAnchorPreload);
      }
      document.removeEventListener("submit", handleFormSubmit);
    });
  };
}

// ---------------------------------------------------------------------------
// RoutePaths<R> — the proxy's type, derived from the route tree
// ---------------------------------------------------------------------------

/** Collects a maximal run of required params (and a trailing splat) into one call's argument tuple. */

/** The search param types a route end carries: input builds URLs, output is what parsing returns. */

/** Terminating calls available on every route end: zero-arg, or search object plus optional hash. */

/**
 * Sees through a lazy `children` thunk: the routes the import's promise
 * resolves to (its `default` or `routes` export, matching the runtime) type
 * exactly like inline children. Only tables genuinely built at runtime —
 * where the thunk's return type is a plain `RouteDefinition[]` — degrade to
 * untyped, definitionally.
 */

/**
 * The type of a router instance's `paths` proxy for a given route tree.
 * Requires the tree to be a literal tuple (`as const` or a `const` type
 * param); non-literal trees fall back to an untyped proxy.
 */

/** Extracts the params record a paths node binds, as runtime (string-valued) params. */

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const encodeParam = value => String(value).split("/").map(encodeURIComponent).join("/");

/**
 * Creates the runtime path proxy. It is instance-scoped: `renderPath` comes
 * from the router's history adapter (eg. hash routing prefixes `#`), and
 * `base` is baked into every produced path.
 */
function createPathsProxy(renderPath = p => p, base = "") {
  const toHref = (pathname, suffix = "") => renderPath(pathname || "/") + suffix;
  function node(pathname) {
    const build = (...args) => {
      let path = pathname;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === "object" && arg !== null) {
          // a search object terminates; an optional hash string may follow
          const hash = typeof args[i + 1] === "string" ? `#${args[i + 1]}` : "";
          return toHref(path, mergeSearchString("", arg) + hash);
        }
        path += `/${encodeParam(arg)}`;
      }
      // zero-arg calls terminate; param-only calls stay chainable
      return args.length ? node(path) : toHref(path);
    };
    return new Proxy(build, {
      get(_, prop) {
        if (prop === "toString") return () => toHref(pathname);
        if (typeof prop === "symbol") return prop === Symbol.toPrimitive ? () => toHref(pathname) : undefined;
        return node(`${pathname}/${prop}`);
      }
    });
  }
  return node(normalizePath(base));
}

const MAX_REDIRECTS = 100;

/** Consider this API opaque and internal. It is likely to change in the future. */
const RouterContextObj = createContext();
const RouteContextObj = createContext();
function useOptionalContext(context) {
  try {
    return useContext(context);
  } catch {
    return undefined;
  }
}
const useRouter = () => invariant(useContext(RouterContextObj), "<A> and 'use' router primitives can be only used inside a Route.");

/**
 * Retrieves method to do navigation. The method accepts a path to navigate to and an optional object with the following options:
 * 
 * - resolve (*boolean*, default `true`): resolve the path against the current route
 * - replace (*boolean*, default `false`): replace the history entry
 * - scroll (*boolean*, default `true`): scroll to top after navigation
 * - state (*any*, default `undefined`): pass custom state to `location.state`
 * 
 * **Note**: The state is serialized using the structured clone algorithm which does not support all object types.
 * 
 * @example
 * ```js
 * const navigate = useNavigate();
 * 
 * if (unauthorized) {
 *   navigate("/login", { replace: true });
 * }
 * ```
 */
const useNavigate = () => useRouter().navigatorFactory();

// Encodes a static path segment like `encodeURIComponent`, but leaves RFC 3986
// pchar characters (sub-delims / ":" / "@") literal, matching how browsers
// report them in `location.pathname`. Non-ASCII characters (eg. CJK paths) are
// still percent-encoded exactly as before, since browsers encode those too.
const encodeSegment = s => encodeURIComponent(s).replace(/%(2B|40|3A|24|26|2C|3B|3D)/g, m => decodeURIComponent(m));

// ---------------------------------------------------------------------------
// Lazy route subtrees
// ---------------------------------------------------------------------------
//
// A `children` thunk (`() => import("./feature/routes")`) is a *boundary*:
// until it resolves, the compiled tree carries a param-less catch-all
// placeholder branch under the boundary's pattern (splat-scored, so static
// siblings still win). Resolution is append-only and cached per thunk, then a
// module-level version signal bumps and every `branches()` consumer
// recompiles — matches, params, and route states all react. The placeholder's
// component reads a memo of the resolution promise, which keeps the enclosing
// navigation transition pending exactly like a `lazy()` route component; its
// `preload` *is* the resolver, so hover-intent preloading kicks the table
// load through the existing component-preload path.

const lazyBoundaries = new WeakMap();
// Module scope: boundary resolution is global, deterministic state (same
// thunk -> same routes), shared by every factory instance and the server's
// flight collector.
const [lazyTreeVersion, setLazyTreeVersion] = createSignal(0);

/** Reactive read of the lazy-subtree version — recompile compiled branches when it changes. */
function trackLazySubtrees() {
  return lazyTreeVersion();
}
function getLazyBoundary(thunk) {
  let record = lazyBoundaries.get(thunk);
  if (!record) lazyBoundaries.set(thunk, record = {
    thunk
  });
  return record;
}

/**
 * Kicks (or joins) a boundary's resolution. Returns the resolved routes
 * synchronously once available, the in-flight promise otherwise. Commit is
 * always async — even for thunks returning arrays — so the version bump
 * never writes a signal from inside a render computation.
 */
function resolveLazySubtree(record) {
  if (record.resolved) return record.resolved;
  return record.promise ||= Promise.resolve(record.thunk()).then(m => {
    const routes = Array.isArray(m) ? m : m.default || m.routes || [];
    record.resolved = routes;
    setLazyTreeVersion(v => v + 1);
    return record.resolved;
  });
}

/**
 * The unresolved boundaries in a match chain. Rendering gates on these (the
 * route-states memo suspends until they land — see routers/components.tsx)
 * and the server's flight collector awaits them before its preload pass.
 */
function unresolvedLazyMatches(matches) {
  const pending = [];
  for (const match of matches) if (match.route.lazy && !match.route.lazy.resolved) pending.push(match.route.lazy);
  return pending;
}
function createLazyPlaceholder(pattern, record) {
  // The placeholder never renders and needs no component — `matches` parks
  // on unresolved boundaries before route contexts are created (kicking the
  // resolver as it does), preloadRoute kicks it directly, and the version
  // bump swaps in the real routes. `path + "/*"` with no splat name matches
  // the boundary itself and everything beneath it without recording a param
  // (createMatcher skips empty splat names).
  const placeholderPattern = pattern + "/*";
  return {
    key: record,
    originalPath: "*",
    pattern: placeholderPattern,
    matcher: createMatcher(placeholderPattern),
    lazy: record
  };
}
function createRoutes(routeDef, base = "") {
  const {
    component,
    preload,
    children,
    info
  } = routeDef;
  const isLeaf = !children || Array.isArray(children) && !children.length;
  const shared = {
    key: routeDef,
    component,
    preload,
    info
  };
  return asArray(routeDef.path).reduce((acc, originalPath) => {
    for (const expandedPath of expandOptionals(originalPath)) {
      const path = joinPaths(base, expandedPath);
      let pattern = isLeaf ? path : path.split("/*", 1)[0];
      pattern = pattern.split("/").map(s => {
        return s.startsWith(":") || s.startsWith("*") ? s : encodeSegment(s);
      }).join("/");
      acc.push({
        ...shared,
        originalPath,
        pattern,
        matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters)
      });
    }
    return acc;
  }, []);
}
function createBranch(routes, index = 0) {
  return {
    routes,
    score: scoreRoute(routes[routes.length - 1]) * 10000 - index,
    matcher(location) {
      const matches = [];
      for (let i = routes.length - 1; i >= 0; i--) {
        const route = routes[i];
        const match = route.matcher(location);
        if (!match) {
          return null;
        }
        matches.unshift({
          ...match,
          route
        });
      }
      return matches;
    }
  };
}
function asArray(value) {
  return Array.isArray(value) ? value : [value];
}
function createBranches(routeDef, base = "", stack = [], branches = []) {
  const routeDefs = asArray(routeDef);
  for (let i = 0, len = routeDefs.length; i < len; i++) {
    const def = routeDefs[i];
    if (def && typeof def === "object") {
      if (!def.hasOwnProperty("path")) def.path = "";
      const routes = createRoutes(def, base);
      for (const route of routes) {
        stack.push(route);
        let children = def.children;
        if (typeof children === "function") {
          const record = getLazyBoundary(children);
          if (record.resolved) {
            children = record.resolved;
          } else {
            // unresolved boundary: a catch-all placeholder holds its ground
            stack.push(createLazyPlaceholder(route.pattern, record));
            branches.push(createBranch([...stack], branches.length));
            stack.pop();
            stack.pop();
            continue;
          }
        }
        const isEmptyArray = Array.isArray(children) && children.length === 0;
        if (children && !isEmptyArray) {
          createBranches(children, route.pattern, stack, branches);
        } else {
          const branch = createBranch([...stack], branches.length);
          branches.push(branch);
        }
        stack.pop();
      }
    }
  }

  // Stack will be empty on final return
  return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}
function getRouteMatches(branches, location) {
  for (let i = 0, len = branches.length; i < len; i++) {
    const match = branches[i].matcher(location);
    if (match) {
      return match;
    }
  }
  return [];
}
function mergeParams(matches) {
  const params = {};
  for (let i = 0; i < matches.length; i++) {
    Object.assign(params, matches[i].params);
  }
  return params;
}
function createLocation(path, state, queryWrapper) {
  const origin = new URL(mockBase);
  const url = createMemo((prev = origin) => {
    const path_ = path();
    try {
      // anchor rooted paths against the origin explicitly - a path with
      // doubled leading slashes would otherwise parse as protocol-relative
      return new URL(path_[0] === "/" ? mockBase + path_ : path_, origin);
    } catch (err) {
      console.error(`Invalid path ${path_}`);
      return prev;
    }
  }, {
    equals: (a, b) => a.href === b.href
  });
  const pathname = createMemo(() => url().pathname);
  const search = createMemo(() => url().search);
  const hash = createMemo(() => url().hash);
  const key = () => "";
  const queryFn = createMemo(() => extractSearchParams(url()));
  return {
    get pathname() {
      return pathname();
    },
    get search() {
      return search();
    },
    get hash() {
      return hash();
    },
    get state() {
      return state();
    },
    get key() {
      return key();
    },
    query: queryWrapper ? queryWrapper(queryFn) : createMemoObject(queryFn)
  };
}

/**
 * Rendezvous between the router and the data layer's single-flight consumer.
 * The Router registers itself at mount (unless `singleFlight={false}`); the
 * action side provides the consumer factory when the first action is created
 * (see data/action.ts). Whichever side arrives first waits for the other, so
 * an action module loaded lazily (a code-split route) still attaches to the
 * already-mounted router — and a router-only app, where no action ever
 * loads, never subscribes to the transport, so the server is never asked to
 * collect.
 */
let flightConsumerFactory;
const flightRouters = new Map();
function registerFlightRouter(router) {
  flightRouters.set(router, flightConsumerFactory && flightConsumerFactory(router));
  return () => {
    const unsubscribe = flightRouters.get(router);
    flightRouters.delete(router);
    unsubscribe && unsubscribe();
  };
}
function provideFlightConsumer(factory) {
  if (flightConsumerFactory) return;
  flightConsumerFactory = factory;
  for (const [router, unsubscribe] of flightRouters) {
    if (!unsubscribe) flightRouters.set(router, factory(router));
  }
}
let intent;
function getIntent() {
  return intent;
}
let inPreloadFn = false;
function getInPreloadFn() {
  return inPreloadFn;
}
function setInPreloadFn(value) {
  inPreloadFn = value;
}
function createRouterContext(integration, branches, getContext, options = {}) {
  const {
    signal: [source, setSource],
    utils = {}
  } = integration;
  const parsePath = utils.parsePath || (p => p);
  const renderPath = utils.renderPath || (p => p);
  // An empty slot until `useBeforeLeave` installs the guard on first use.
  const beforeLeave = utils.beforeLeave || {};
  const basePath = resolvePath("", options.base || "");
  const initialSource = untrack(source);
  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !initialSource.value) {
    setSource({
      value: basePath,
      replace: true,
      scroll: false
    });
  }
  const [isNavigating, setIsRouting] = createSignal(false, {
    ownedWrite: true
  });

  // Navigate override written from event handlers.
  const [navigateTarget, setNavigateTarget] = createSignal(undefined, {
    ownedWrite: true
  });

  // Keep track of last target, so that last call to navigate wins
  let lastTransitionTarget;

  // source() remains canonical for native history changes; navigateTarget()
  // temporarily overrides it for in-flight programmatic navigation.
  const effective = createMemo(() => navigateTarget() ?? source());
  const location = createLocation(() => effective().value, () => effective().state, utils.queryWrapper);
  const referrers = [];
  let submissions;
  const matches = createMemo(() => {
    const pathname = typeof options.transformUrl === "function" ? options.transformUrl(location.pathname) : location.pathname;
    const m = getRouteMatches(branches(), pathname);
    // An unresolved lazy subtree parks readers on not-ready semantics — the
    // navigation transition (or the SSR stream) holds until the table lands.
    // NotReadyError (not a returned promise) because a match chain is full
    // of component functions the hydration serializer must never see. The
    // recompute comes from the version-signal dependency on the client and
    // from the carried promise's retry on the server; a boundary nested
    // inside a boundary just parks the recomputed chain again.
    const pending = unresolvedLazyMatches(m);
    if (pending.length) throw new NotReadyError(Promise.all(pending.map(resolveLazySubtree)));
    return m;
  });

  // Every write is a transition in Solid 2, so a native history pop forks the
  // source signal exactly like programmatic navigation does. isRouting is
  // therefore derived: the manual flag covers navigateFromRoute's explicit
  // window, and isPending over the location/matches read reports any
  // in-flight fork — including popstate traversals and the lazy-subtree
  // resolution matches() parks on.
  const isRouting = createMemo(() => isNavigating() || isPending(() => (matches(), location.search, location.hash)));
  const buildParams = () => mergeParams(matches());
  const wrapParams = utils.paramsWrapper ? getParams => utils.paramsWrapper(getParams, branches) : getParams => createMemoObject(getParams);
  const params = wrapParams(buildParams);
  const baseRoute = {
    pattern: basePath,
    params,
    path: () => basePath,
    outlet: () => null,
    resolvePath(to) {
      return resolvePath(basePath, to);
    }
  };
  return {
    base: baseRoute,
    location,
    params,
    wrapParams,
    isRouting,
    get pendingTarget() {
      return lastTransitionTarget;
    },
    renderPath,
    parsePath,
    navigatorFactory,
    matches,
    beforeLeave,
    preloadRoute,
    singleFlight: options.singleFlight === undefined ? true : options.singleFlight,
    get submissions() {
      return submissions ||= createSignal([], {
        ownedWrite: true
      });
    }
  };
  function navigateFromRoute(route, to, options) {
    // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
    untrack(() => {
      if (typeof to === "number") {
        if (!to) ; else if (utils.go) {
          utils.go(to);
        } else {
          console.warn("Router integration does not support relative routing");
        }
        return;
      }
      // typed path proxy nodes coerce to their href
      if (typeof to !== "string") to = to.toString();
      const queryOnly = !to || to[0] === "?";
      const {
        replace,
        resolve,
        scroll,
        state: nextState
      } = {
        replace: false,
        resolve: !queryOnly,
        scroll: true,
        ...options
      };
      const resolvedTo = resolve ? route.resolvePath(to) : resolvePath(queryOnly && location.pathname || "", to);
      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }
      const current = effective();
      if (resolvedTo !== current.value || nextState !== current.state) {
        if (!beforeLeave.current || beforeLeave.current.confirm(resolvedTo, options)) {
          referrers.push({
            value: current.value,
            replace,
            scroll,
            state: current.state
          });
          const newTarget = {
            value: resolvedTo,
            state: nextState
          };
          const firstNavigation = lastTransitionTarget === undefined;
          intent = "navigate";
          // assign the target before flushing so effects that run for the
          // isRouting flip (e.g. pending link state) can read it
          lastTransitionTarget = newTarget;
          if (firstNavigation) {
            setIsRouting(true);
            flush();
          }
          if (lastTransitionTarget === newTarget) {
            setNavigateTarget({
              ...lastTransitionTarget
            });
            queueMicrotask(() => {
              if (lastTransitionTarget !== newTarget) return;
              intent = undefined;
              navigateEnd(lastTransitionTarget);
              setNavigateTarget(undefined);
              setIsRouting(false);
              lastTransitionTarget = undefined;
            });
          }
        }
      }
    });
  }
  function navigatorFactory(route) {
    // Workaround for vite issue (https://github.com/vitejs/vite/issues/3803)
    route = route || useOptionalContext(RouteContextObj) || baseRoute;
    return (to, options) => navigateFromRoute(route, to, options);
  }
  function navigateEnd(next) {
    const first = referrers[0];
    if (first) {
      setSource({
        ...next,
        replace: first.replace,
        scroll: first.scroll
      });
      referrers.length = 0;
    }
  }
  function preloadRoute(url, preloadData) {
    const matches = getRouteMatches(branches(), url.pathname);
    // An unresolved lazy subtree in the chain: the placeholder's
    // component.preload (below) kicks the table load; once it lands,
    // preload again so the real inner routes warm too.
    const boundary = matches.find(m => m.route.lazy && !m.route.lazy.resolved);
    boundary && resolveLazySubtree(boundary.route.lazy).then(() => preloadRoute(url, preloadData));
    const prevIntent = intent;
    intent = "preload";
    for (let match in matches) {
      const {
        route,
        params
      } = matches[match];
      route.component && route.component.preload && route.component.preload();
      const {
        preload
      } = route;
      inPreloadFn = true;
      preloadData && preload && runWithOwner(getContext(), () => preload({
        params,
        location: {
          pathname: url.pathname,
          search: url.search,
          hash: url.hash,
          query: extractSearchParams(url),
          state: null,
          key: ""
        },
        intent: "preload"
      }));
      inPreloadFn = false;
    }
    intent = prevIntent;
  }
}
function createRouteContext(router, parent, outlet, match, matches = () => [match()]) {
  const {
    base,
    location,
    wrapParams
  } = router;
  const {
    pattern,
    component,
    preload
  } = match().route;
  const path = createMemo(() => match().path);
  // Params scoped to this route's lifetime. `matches` is expected to retain
  // its last valid value while this route is being torn down, so outgoing
  // components and preloads never observe another route's params.
  const params = wrapParams(() => mergeParams(matches()));
  component && component.preload && component.preload();
  inPreloadFn = true;
  const data = preload ? preload({
    params,
    location,
    intent: intent || "initial"
  }) : undefined;
  inPreloadFn = false;
  const route = {
    parent,
    pattern,
    params,
    path,
    outlet: () => component ? createComponent(component, {
      params,
      location,
      data,
      get children() {
        return outlet();
      }
    }) : outlet(),
    resolvePath(to) {
      return resolvePath(base.path(), to, path());
    }
  };
  return route;
}

function Root(props) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  const data = createMemo(() => props.preload && untrack(() => {
    setInPreloadFn(true);
    try {
      return props.preload({
        params,
        location,
        intent: getIntent() || "initial"
      });
    } finally {
      setInPreloadFn(false);
    }
  }));
  const RootComp = props.root;
  if (RootComp) {
    return createComponent(RootComp, {
      params: params,
      location: location,
      get data() {
        return data();
      },
      get children() {
        return props.children;
      }
    });
  }
  return props.children;
}
function Routes(props) {
  const disposers = [];
  let root;
  let prevMatches;
  // dispose the detached per-route roots when this component unmounts, otherwise
  // they stay subscribed to `matches` and crash on a later navigation (#451)
  onCleanup(() => disposers.forEach(dispose => dispose()));
  // Route roots must outlive re-runs of the `routeStates` memo below, so they
  // are created under the owner of this component rather than the memo's
  // computation (which disposes its children every time it re-runs).
  const owner = getOwner();
  const routeStates = createMemo(prev => {
    // While a lazy subtree resolves, `matches()` is not ready and this
    // computation parks with it — no route contexts are created against
    // placeholder matches.
    const nextMatches = props.routerState.matches();
    const previousMatches = prevMatches;
    let equal = previousMatches && nextMatches.length === previousMatches.length;
    const next = [];
    for (let i = 0, len = nextMatches.length; i < len; i++) {
      const prevMatch = previousMatches && previousMatches[i];
      const nextMatch = nextMatches[i];
      if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
        next[i] = prev[i];
      } else {
        equal = false;
        if (disposers[i]) {
          disposers[i]();
        }
        runWithOwner(owner, () => createRoot(dispose => {
          disposers[i] = dispose;
          const routeKey = nextMatch.route.key;
          // Retain the last matches in which this route participated so
          // that its components and preloads never observe another
          // route's params/path while this route is being torn down.
          const matchesAtLevel = createMemo(prev => {
            const routeMatches = props.routerState.matches();
            const m = routeMatches[i];
            return m && m.route.key === routeKey ? routeMatches : prev || nextMatches;
          });
          next[i] = createRouteContext(props.routerState, next[i - 1] || props.routerState.base, createOutlet(() => routeStates()?.[i + 1]), () => matchesAtLevel()[i], matchesAtLevel);
        }));
      }
    }
    disposers.splice(nextMatches.length).forEach(dispose => dispose());
    if (prev && equal) {
      prevMatches = nextMatches;
      return prev;
    }
    root = next[0];
    prevMatches = nextMatches;
    return next;
  });
  const outlet = createOutlet(() => routeStates() && root);
  return memo(outlet);
}
const createOutlet = child => {
  return () => {
    const c = child();
    if (c) {
      return createComponent(RouteContextObj, {
        value: c,
        get children() {
          return c.outlet();
        }
      });
    }
    return undefined;
  };
};

function bindEvent(target, type, handler) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

// Depth stamping supports blocking browser-initiated navigation (back/forward)
// for `useBeforeLeave`. It stays always-on — a couple of history.state writes —
// so blocking stays exact no matter when the first guard subscribes, while the
// guard machinery itself lives behind the lazy `beforeLeave` slot.

let depth;
function saveCurrentDepth() {
  if (!window.history.state || window.history.state._depth == null) {
    window.history.replaceState({
      ...window.history.state,
      _depth: window.history.length - 1
    }, "");
  }
  depth = window.history.state._depth;
}
function keepDepth(state) {
  return {
    ...state,
    _depth: window.history.state && window.history.state._depth
  };
}
function notifyIfNotBlocked(notify, block) {
  let ignore = false;
  return () => {
    const prevDepth = depth;
    saveCurrentDepth();
    const delta = prevDepth == null ? null : depth - prevDepth;
    if (ignore) {
      ignore = false;
      return;
    }
    if (delta && block(delta)) {
      ignore = true;
      window.history.go(-delta);
    } else {
      notify();
    }
  };
}
function scrollToHash(hash, fallbackTop) {
  const el = hash && document.getElementById(hash);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}

/**
 * A history adapter: the source of truth for the current URL and how
 * navigations write back to it. Adapters are plain imported values so
 * unused ones never enter the bundle — `createRouter` defaults to browser
 * history on the client and the request URL on the server.
 */

function browserHistory() {
  const getSource = () => {
    const url = window.location.pathname + window.location.search;
    const state = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? undefined : window.history.state;
    return {
      value: url + window.location.hash,
      state
    };
  };
  const beforeLeave = {};
  saveCurrentDepth();
  return {
    get: getSource,
    set({
      value,
      replace,
      scroll,
      state
    }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      scrollToHash(decodeURIComponent(window.location.hash.slice(1)), scroll);
      saveCurrentDepth();
    },
    init: notify => bindEvent(window, "popstate", notifyIfNotBlocked(notify, delta => {
      const guard = beforeLeave.current;
      if (!guard) return false;
      if (delta) {
        return !guard.confirm(delta);
      } else {
        const s = getSource();
        return !guard.confirm(s.value, {
          state: s.state
        });
      }
    })),
    utils: {
      go: delta => window.history.go(delta),
      beforeLeave
    }
  };
}

const STORAGE_KEY = "solid-router:scroll";

/**
 * Explicit scroll restoration for back/forward navigation. The browser's
 * native same-document heuristic is unreliable for suspense-driven rendering:
 * if the destination route forces a layout while the document is still short,
 * the saved offset for the previous entry is clamped and lost (#577).
 *
 * Positions are captured continuously from the scroll event, keyed by the
 * `_depth` the router already stamps on every history entry — capturing at
 * scroll time (rather than at exit) stays correct through `useBeforeLeave`
 * blocked/reverted traversals. The map persists to sessionStorage on pagehide
 * so restoration survives reloads, which `scrollRestoration = "manual"`
 * otherwise disables.
 *
 * Restoration is a single scroll once routing settles — the same strategy
 * SvelteKit, TanStack Router and React Router use. Settling after the
 * transition commits is what makes the offset reachable; chasing a still-
 * growing document afterwards (a ResizeObserver re-asserting the offset as
 * content arrives) was tried and removed: no peer router does it, an
 * unbounded observer re-clamps the viewport to the bottom when the target is
 * never reachable (a list that is genuinely shorter now), and scroll-induced
 * layout changes can feed it back into itself. Content that commits after the
 * transition settles — an image without reserved space, a boundary below the
 * fold — keeps whatever offset the document can hold.
 */
function createScrollRestoration() {
  window.history.scrollRestoration = "manual";
  // the current entry needs its depth stamp for captures to have a key, even
  // if something replaced history.state after the adapter stamped it
  saveCurrentDepth();
  let positions = {};
  try {
    positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
  } catch {}
  const depth = () => window.history.state && window.history.state._depth;
  let programmatic = false;
  let pending;
  const unbind = [bindEvent(window, "scroll", () => {
    const d = depth();
    if (d != null) positions[d] = window.scrollY;
    // the user took over — a pending restore would yank them
    if (!programmatic) pending = undefined;
  }), bindEvent(window, "pagehide", () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {}
  })];
  const restore = () => {
    if (pending == null) return;
    const y = positions[pending];
    pending = undefined;
    if (y == null) return;
    // flagged so the resulting scroll event is not mistaken for the user
    // taking over (which cancels a pending restore)
    programmatic = true;
    window.scrollTo(0, y);
    programmatic = false;
  };
  return {
    /** When the adapter notifies a traversal: mark the target for restoration. */
    onPop() {
      pending = depth();
    },
    /** After a push: forward entries died, and this depth may be reused. */
    onPush() {
      const d = depth();
      if (d != null) for (const k in positions) +k >= d && delete positions[k];
    },
    create(router) {
      // Restore once the traversal has settled: key on the location (a fully
      // synchronous pop commits without isRouting ever flipping) and on
      // isRouting, which reports in-flight transitions — native pops
      // included — and holds the restore until they commit. restore() no-ops
      // unless a traversal marked a target, so push navigations are inert.
      // `transparent` keeps the effect invisible to the hydration id scheme —
      // same reasoning as the link-claims effect (claims.ts): this setup is
      // client-only, so an id-consuming node here has no server counterpart
      // and every hydration id allocated after it shifts by one child slot.
      // The visible failure is any <Loading> content that settled before the
      // shell flush (a cache hit, a preloaded query): its serialized value and
      // inlined markup are keyed under the server's ids, the shifted client
      // misses both, recomputes, and re-renders the route fresh — duplicating
      // the server DOM and leaving it inert.
      createEffect(() => ({
        url: router.location.pathname + router.location.search + router.location.hash,
        routing: router.isRouting()
      }), current => {
        if (!current.routing) restore();
      }, {
        transparent: true
      });
      onCleanup(() => unbind.forEach(u => u()));
      // reload/back_forward document loads land on an existing entry (a fresh
      // navigation starts a new one and belongs at the top); the effect's
      // initial run performs the restore after first render
      const [nav] = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (nav && nav.type !== "navigate") pending = depth();
    }
  };
}
/**
 * Threads restoration through a history adapter: pushes prune dead forward
 * entries, and adapter notifications (unblocked pops) mark the traversal
 * target. Notification runs after the adapter's depth bookkeeping, so the
 * marked depth is the entry being restored to.
 */
function withScrollRestoration(history, restoration) {
  return {
    ...history,
    set(next) {
      history.set(next);
      next.replace || restoration.onPush();
    },
    init: history.init && (notify => history.init(value => {
      restoration.onPop();
      notify(value);
    }))
  };
}
/** Wraps a history adapter in the integration signal the router core consumes. Must run under a reactive owner. */
function createIntegration(history) {
  let ignore = false;
  const wrap = value => typeof value === "string" ? {
    value
  } : value;
  const [read, write] = createSignal(wrap(history.get()), {
    equals: (a, b) => a.value === b.value && a.state === b.state,
    ownedWrite: true
  });
  const signal = [read, next => {
    !ignore && history.set(next);
    if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = true;
    write(next);
  }];
  history.init && onCleanup(history.init((value = history.get()) => {
    ignore = true;
    signal[1](wrap(value));
    ignore = false;
  }));
  return {
    signal,
    utils: history.utils
  };
}
function createRouter(config) {
  const basePath = config.base || "";
  // Routes are immutable per instance, so compilation is shared by every
  // mount, request, and `match()` call — recompiled only when a lazy subtree
  // resolves (append-only: resolution, not mutation). Reading the version
  // inside a computation subscribes it; plain calls just see current state.
  let compiled;
  let compiledVersion = -1;
  const branches = () => {
    const version = trackLazySubtrees();
    if (!compiled || compiledVersion !== version) {
      compiled = createBranches(config.routes, basePath);
      compiledVersion = version;
    }
    return compiled;
  };
  const renderPath = config.history && config.history.utils && config.history.utils.renderPath || undefined;
  function RouterComponent(props) {
    // One router per app: the session (location, history, delegation, link
    // claims, preloading) has a single owner, and a second instance would
    // fight it — stale content on click navigations, conflicting link
    // attributes. Compose route trees instead; lazy subtrees are the planned
    // answer for definitions unknown at build time.
    if (useOptionalContext(RouterContextObj)) {
      console.warn("Mounting a router inside another router is not supported. " + "Compose route trees in one createRouter config instead.");
    }
    const root = untrack(() => props.children);
    let restoration;
    let history = config.history;
    if ((config.scrollRestoration ?? !history)) {
      restoration = createScrollRestoration();
      history = withScrollRestoration(history || browserHistory(), restoration);
    }
    const integration = createIntegration(history || browserHistory());
    let context;
    const routerState = createRouterContext(integration, branches, () => context, {
      base: basePath,
      singleFlight: config.singleFlight,
      transformUrl: config.transformUrl
    });
    {
      setupNativeEvents({
        preload: config.preloadLinks,
        explicitLinks: config.explicitLinks,
        actionBase: config.actionBase,
        transformUrl: config.transformUrl
      })(routerState);
      setupLinkClaims(routerState, config.explicitLinks);
      if (routerState.singleFlight) onCleanup(registerFlightRouter(routerState));
      restoration && restoration.create(routerState);
    }
    return createComponent(RouterContextObj, {
      value: routerState,
      get children() {
        return createComponent(Root, {
          routerState: routerState,
          root: root,
          get preload() {
            return config.preload;
          },
          get children() {
            return [memo(() => (context = getOwner()) && null), createComponent(Routes, {
              routerState: routerState,
              branches: branches
            })];
          }
        });
      }
    });
  }
  const instance = Object.assign(RouterComponent, {
    routes: config.routes,
    config,
    match(url) {
      const u = new URL(url, mockBase);
      const pathname = config.transformUrl ? config.transformUrl(u.pathname) : u.pathname;
      return getRouteMatches(branches(), pathname).map(({
        route,
        path,
        params
      }) => ({
        path: route.originalPath,
        pattern: route.pattern,
        match: path,
        params,
        info: route.info
      }));
    }
  });
  // Built on first access (a getter via Object.assign would run during the
  // copy) so runtimes without Proxy — some older TVs — can still route as
  // long as they never touch typed paths.
  let paths;
  Object.defineProperty(instance, "paths", {
    get: () => paths || (paths = createPathsProxy(renderPath, basePath))
  });
  return instance;
}

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
const CACHE_TIMEOUT = 180000;
let cacheMap = new Map();

// cleanup forward/back cache
{
  setInterval(() => {
    const now = Date.now();
    for (let [k, v] of cacheMap.entries()) {
      if (!v[4].count && now - v[0] > CACHE_TIMEOUT) {
        cacheMap.delete(k);
      }
    }
  }, 300000);
}
function getCache() {
  return cacheMap;
}

/**
 * Revalidates the given cache entry/entries.
 */
function revalidate(key, force = true) {
  const now = Date.now();
  cacheKeyOp(key, entry => {
    force && (entry[0] = 0); //force cache miss
    entry[4][1](now); // retrigger live signals
  });
}
function cacheKeyOp(key, fn) {
  key && !Array.isArray(key) && (key = [key]);
  for (let k of cacheMap.keys()) {
    if (key === undefined || matchKey(k, key)) fn(cacheMap.get(k));
  }
}
function query(fn, name) {
  // query implies GET: the router primitive is the declaration site, so a
  // server function handed to query() is wrapped with core `GET(fn)` here,
  // at query-creation (module scope) — the server half records the method
  // declaration for dispatch, the client half swaps in the GET transport.
  // An explicit `GET(fn)` already carries the declaration on the metadata
  // channel (`getServerFunctionMetadata(fn)?.method === "GET"`) and passes
  // through; non-server functions are untouched.
  if (isServerFunction(fn) && !getServerFunctionMetadata(fn)?.method) {
    fn = GET(fn);
  }
  const cachedFn = (...args) => {
    const cache = getCache();
    const intent = getIntent();
    const inPreloadFn = getInPreloadFn();
    const owner = getOwner();
    const navigate = owner ? useNavigate() : undefined;
    const now = Date.now();
    const key = name + hashKey(args);
    let cached = cache.get(key);
    let tracking;
    if (getObserver() && !isServer) {
      tracking = true;
      onCleanup(() => cached[4].count--);
    }
    if (cached && cached[0] && (intent === "native" || cached[4].count || Date.now() - cached[0] < PRELOAD_TIMEOUT)) {
      if (tracking) {
        cached[4].count++;
        cached[4][0](); // track
      }
      if (cached[3] === "preload" && intent !== "preload") {
        cached[0] = now;
      }
      let res = cached[1];
      if (intent !== "preload") {
        res = "then" in cached[1] ? cached[1].then(handleResponse(false), handleResponse(true)) : handleResponse(false)(cached[1]);
        intent === "navigate" && cached[4][1](cached[0]); // update version
      }
      inPreloadFn && "then" in res && res.catch(() => {});
      return res;
    }
    let res;
    if (sharedConfig.has && sharedConfig.has(key)) {
      res = sharedConfig.load(key); // hydrating
      // @ts-ignore at least until we add a delete method to sharedConfig
      delete globalThis._$HY.r[key];
    } else res = fn(...args);
    if (cached) {
      cached[0] = now;
      cached[1] = res;
      cached[3] = intent;
      intent === "navigate" && cached[4][1](cached[0]); // update version
    } else {
      cache.set(key, cached = [now, res,, intent, createSignal(now, {
        ownedWrite: true
      })]);
      cached[4].count = 0;
    }
    if (tracking) {
      cached[4].count++;
      cached[4][0](); // track
    }
    if (intent !== "preload") {
      res = "then" in res ? res.then(handleResponse(false), handleResponse(true)) : handleResponse(false)(res);
    }
    inPreloadFn && "then" in res && res.catch(() => {});
    return res;
    function handleResponse(error) {
      return async v => {
        let enveloped;
        let hasEnveloped = false;
        if (isResponseEnvelope(v)) {
          // respond(): the value rides in memory beside the metadata
          enveloped = v.value;
          hasEnveloped = true;
          v = v.response;
        }
        if (v instanceof Response) {
          const url = v.headers.get(LocationHeader);
          if (url !== null) {
            // client + server relative redirect
            if (navigate && url.startsWith("/")) navigate(url, {
              replace: true
            });else window.location.href = url;
            return;
          }
          if (hasEnveloped) v = enveloped;else if (v.body) {
            // responses the transport hands over whole (revalidation) carry a
            // codec-encoded body; anything else (a raw user Response) stays whole
            const decoded = await decodeResponse(v);
            if (decoded !== undefined) v = decoded;
          }
        }
        if (error) throw v;
        cached[2] = v;
        return v;
      };
    }
  };
  cachedFn.keyFor = (...args) => name + hashKey(args);
  cachedFn.key = name;
  return cachedFn;
}
query.get = key => {
  const cached = getCache().get(key);
  return cached[2];
};
query.set = (key, value) => {
  const cache = getCache();
  const now = Date.now();
  let cached = cache.get(key);
  if (cached) {
    cached[0] = now;
    cached[1] = Promise.resolve(value);
    cached[2] = value;
    cached[3] = "preload";
  } else {
    cache.set(key, cached = [now, Promise.resolve(value), value, "preload", createSignal(now, {
      ownedWrite: true
    })]);
    cached[4].count = 0;
  }
};
query.delete = key => getCache().delete(key);
query.clear = () => getCache().clear();
function matchKey(key, keys) {
  for (let k of keys) {
    if (k && key.startsWith(k)) return true;
  }
  return false;
}

// Modified from the amazing Tanstack Query library (MIT)
// https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L168
function hashKey(args) {
  return JSON.stringify(args, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}
function isPlainObject(obj) {
  let proto;
  return obj != null && typeof obj === "object" && (!(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype);
}

const submitHooksSymbol = Symbol("routerActionSubmitHooks");
const settledHooksSymbol = Symbol("routerActionSettledHooks");
const invokeSymbol = Symbol("routerActionInvoke");

// Forms submitted through delegation are marked `aria-busy` while their
// action is in flight — the form half of the attribute vocabulary links get
// (`data-active`/`data-pending`). Style with `form[aria-busy] button { ... }`.
// A counter (not a boolean) keeps the attribute through overlapping
// submissions from the same form.
const busyForms = /* #__PURE__ */new WeakMap();
function setFormBusy(form, delta) {
  const count = (busyForms.get(form) || 0) + delta;
  busyForms.set(form, count);
  count > 0 ? form.setAttribute("aria-busy", "true") : form.removeAttribute("aria-busy");
}
const actions = /* #__PURE__ */new Map();

/**
 * The document-delegation submit handler for router actions. Lives here —
 * not in events.ts — so the router's event wiring holds no static reference
 * to the action module; `installRouterIntegrations` slots it in when the
 * first action is created on the client.
 */
function handleFormAction(evt, router, actionBase) {
  if (evt.defaultPrevented) return;
  let actionRef = evt.submitter && evt.submitter.hasAttribute("formaction") ? evt.submitter.getAttribute("formaction") : evt.target.getAttribute("action");
  if (!actionRef) return;
  const serverAction = !actionRef.startsWith("https://action/");
  if (serverAction) {
    // normalize server actions
    const url = new URL(actionRef, mockBase);
    actionRef = router.parsePath(url.pathname + url.search);
    if (!actionRef.startsWith(actionBase)) return;
  }
  if (evt.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
  // A registry miss on a server-action url is a direct bind whose module
  // never loaded client-side (server components): the url is self-describing
  // (`?id`, bound `?args`), so a generic invocation is synthesized from it —
  // delegation alone is sufficient, the no-JS path stays a no-JS fallback.
  // Client-only actions (`https://action/`) are their module's JS by
  // definition, so a miss there falls through to native submission.
  const handler = actions.get(actionRef) || serverAction && createServerFormAction(actionRef);
  if (handler) {
    evt.preventDefault();
    const data = new FormData(evt.target, evt.submitter);
    handler.call({
      r: router,
      f: evt.target
    }, evt.target.enctype === "multipart/form-data" ? data : new URLSearchParams(data));
  }
}

/**
 * Synthesizes a router action for a server-rendered action url. The url
 * carries everything an invocation needs — the function id and any bound
 * `.with()` arguments (plain JSON in `?args`, which the server prepends for
 * natural-encoding bodies exactly as it does for no-JS posts) — so the
 * FormData is posted to it verbatim through the server-function transport:
 * submissions, `aria-busy`, redirects, revalidation, and single-flight all
 * flow through the normal action machinery. Registered under the url, so
 * repeat submits reuse it (and a later real registration overrides it).
 */
function createServerFormAction(url) {
  const id = new URL(url, mockBase).searchParams.get("id");
  if (!id) return undefined;
  // typecheck resolves the server half of the dual module; this path only
  // runs in the browser, where the client transport's signature applies
  const stub = createServerReference(id, undefined, url);
  const caller = Object.assign(form => stub(form), {
    url
  });
  return actionImpl(caller);
}

/**
 * Entry point for delegation's lazy fallback (data/events.ts): when no form
 * handler was ever installed — no action module in the client graph at all —
 * the router intercepts posts to server-action urls synchronously and loads
 * this module to run them. The FormData was captured at submit time; only
 * the enctype conversion and the generic invocation happen here.
 */
function submitServerForm(router, url, form, data) {
  const handler = actions.get(url) || createServerFormAction(url);
  // no `?id` — not the server function convention; nothing can run it,
  // resubmit natively (submit() bypasses the delegated handler)
  if (!handler) return form.submit();
  handler.call({
    r: router,
    f: form
  }, form.enctype === "multipart/form-data" ? data : new URLSearchParams(data));
}

// Wires the action layer into the router's slots exactly once, triggered by
// the first action creation. Not an import side effect — with
// `sideEffects: false`, module evaluation only happens when action() is
// actually used, which is precisely when the wiring is wanted: no action in
// the graph means no form interception, no single-flight subscription (the
// server is never asked to collect), and no flash cookies to decode. On the
// server, actions are created at module scope, so the flash decoder is
// always installed before useSubmission can read the submissions signal.
let integrationsInstalled = false;
function installRouterIntegrations() {
  if (integrationsInstalled) return;
  integrationsInstalled = true;
  {
    setRouterFormHandler(handleFormAction);
    provideFlightConsumer(setupFlightDataConsumer);
  }
}
function actionImpl(fn, options = {}) {
  async function invoke(variables, current) {
    const router = this.r;
    const form = this.f;
    const submitHooks = current[submitHooksSymbol];
    const settledHooks = current[settledHooksSymbol];
    // Single-flight opt-in is no longer per call: the router's registered
    // flight-data consumer (see setupFlightDataConsumer) makes the transport
    // send the request header itself, so the mutation is just called.
    const runMutation = () => fn(...variables);
    const run = action(async function* (context) {
      context.optimistic?.();
      try {
        const value = await context.call();
        yield;
        return {
          error: false,
          value
        };
      } catch (error) {
        yield;
        return {
          error: true,
          value: error
        };
      }
    });
    form && setFormBusy(form, 1);
    let settled;
    let response;
    // The transport consumer is awaited before a single-flight mutation
    // resolves, so a counter delta over the call tells whether this action's
    // metadata was already applied. Overlapping mutations can cross-attribute
    // a run (skipping one default revalidation another pass just covered) —
    // a far smaller window than predicting from the function's identity,
    // which misses every response the server returned without flight data.
    const flightApplicationsBefore = flightApplications;
    try {
      settled = await settleActionResult(run({
        call: runMutation,
        optimistic: submitHooks.size ? () => {
          for (const hook of submitHooks.values()) hook(...variables);
        } : undefined
      }));
      response = await handleResponse(settled.value, settled.error, router.navigatorFactory(), flightApplications !== flightApplicationsBefore);
    } finally {
      form && setFormBusy(form, -1);
    }
    let submission;
    submission = {
      input: variables,
      url,
      result: response && response.data,
      error: response && response.error,
      clear() {
        router.submissions[1](entries => entries.filter(entry => entry !== submission));
      },
      retry() {
        submission.clear();
        return current[invokeSymbol].call({
          r: router,
          f: form
        }, variables, current);
      }
    };
    // Book-keeping is intentional: only outcomes worth showing or retrying
    // (a result or an error) enter the submissions list, so the typical void
    // mutation leaves nothing behind. Settled hooks still see every
    // completion — void, metadata-only, and redirects included — one
    // `onSettled` per invocation (#580).
    response && router.submissions[1](entries => [...entries, submission]);
    for (const hook of settledHooks.values()) hook(submission);
    if (response) {
      if (response.error && !form) throw response.error;
      return response.data;
    }
    return undefined;
  }
  const o = typeof options === "string" ? {
    name: options
  } : options;
  const name = o.name || (String(hashString(fn.toString())) );
  const url = fn.url || name && `https://action/${name}` || "";
  const wrapped = toAction(invoke, url);
  if (name) setFunctionName(wrapped, name);
  return wrapped;
}
function toAction(invoke, url, boundArgs = [], base = url, submitHooks = new Map(), settledHooks = new Map()) {
  const fn = function (...args) {
    return invoke.call(this, [...boundArgs, ...args], fn);
  };
  fn.toString = () => {
    if (!url) throw new Error("Client Actions need explicit names if server rendered");
    return url;
  };
  fn.with = function (...args) {
    const uri = new URL(url, mockBase);
    uri.searchParams.set("args", hashKey(args));
    const next = toAction(invoke, (uri.origin === "https://action" ? uri.origin : "") + uri.pathname + uri.search, [...boundArgs, ...args], base, submitHooks, settledHooks);
    return next;
  };
  fn.onSubmit = function (hook) {
    const id = Symbol("actionOnSubmitHook");
    submitHooks.set(id, hook);
    getOwner() && onCleanup(() => submitHooks.delete(id));
    return this;
  };
  fn.onSettled = function (hook) {
    const id = Symbol("actionOnSettledHook");
    settledHooks.set(id, hook);
    getOwner() && onCleanup(() => settledHooks.delete(id));
    return this;
  };
  fn.url = url;
  fn.base = base;
  fn[submitHooksSymbol] = submitHooks;
  fn[settledHooksSymbol] = settledHooks;
  fn[invokeSymbol] = invoke;
  installRouterIntegrations();
  {
    actions.set(url, fn);
    // Only remove the registration if it still belongs to this instance —
    // a re-created action (e.g. a new `.with()` binding after revalidation)
    // may have registered itself under the same URL since.
    getOwner() && onCleanup(() => actions.get(url) === fn && actions.delete(url));
  }
  return fn;
}
const hashString = s => s.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0) | 0, 0);
async function settleActionResult(result) {
  const value = result;
  if (value && typeof value.then === "function") {
    return result.then(value => value);
  }
  if (value && typeof value.next === "function") {
    const iterator = value;
    let next = await iterator.next();
    while (!next.done) {
      next = await iterator.next();
    }
    return next.value;
  }
  return result;
}

// Invocation count of the flight-data consumer. An action compares it across
// its mutation call to learn whether the transport already applied this
// response's metadata (and so the default revalidation pass must not run
// again and wipe the freshly seeded cache).
let flightApplications = 0;

/**
 * Registers the router as the single-flight consumer of the server function
 * transport. Subscribing is the opt-in: while registered, the transport
 * sends the `X-Single-Flight` request header on mutations and delivers the
 * folded payload here — fresh route data is seeded into the `query` cache
 * and the envelope metadata (redirect `Location`, `X-Revalidate` keys) is
 * applied, all before the action sees its plain return value. Called by the
 * Router component on the client unless `singleFlight={false}`, which now
 * simply means "never subscribe" — no consumer, no request header, no
 * collection work on the server. Returns the unsubscribe function.
 */
function setupFlightDataConsumer(router) {
  return subscribeFlightData((data, {
    response
  }) => {
    flightApplications++;
    return applyResponseMetadata(response, router.navigatorFactory(), data);
  });
}

/**
 * Applies a server function response's integration metadata: `X-Revalidate`
 * keys invalidate, `Location` navigates (hard for absolute urls), flight
 * data seeds the query cache, and matching entries revalidate. Shared by
 * the flight-data consumer and the action response path (which still sees
 * metadata-bearing responses when no flight data was collected).
 */
function applyResponseMetadata(metadata, navigate, flightData) {
  let keys;
  if (metadata) {
    if (metadata.headers.has(REVALIDATE_HEADER$1)) keys = metadata.headers.get(REVALIDATE_HEADER$1).split(",");
    if (metadata.headers.has("Location")) {
      const locationUrl = metadata.headers.get("Location") || "/";
      if (locationUrl.startsWith("http")) {
        window.location.href = locationUrl;
      } else {
        navigate(locationUrl);
      }
    }
  }
  // invalidate
  cacheKeyOp(keys, entry => entry[0] = 0);
  // set cache
  flightData && Object.keys(flightData).forEach(k => query.set(k, flightData[k]));
  // trigger revalidation
  revalidate(keys, false);
}
async function handleResponse(response, error, navigate, metadataHandled) {
  let data;
  let flightData;
  let metadata;
  if (isResponseEnvelope(response)) {
    // client-only respond(): the value rides in memory beside the metadata
    data = response.value;
    metadata = response.response;
  } else if (response instanceof Response) {
    metadata = response;
    // responses the transport hands over whole (redirects, revalidation)
    // carry a codec-encoded body the router decodes itself. With the
    // flight-data consumer registered single-flight payloads never reach
    // this path, but a manually opted-in call (no consumer) still can —
    // unwrap the standardized { value, data } shape for it too.
    if (response.body) {
      data = await decodeResponse(response);
      if (response.headers.has(SINGLE_FLIGHT_HEADER)) {
        const payload = data;
        data = payload.value;
        flightData = payload.data;
      }
    }
  } else if (error) return {
    error: response
  };else data = response;
  // The transport consumer applies metadata before returning a server
  // function's unwrapped value. Do not treat that value as a second plain
  // action response and invalidate the freshly seeded query cache again.
  if (!metadataHandled || metadata || flightData) applyResponseMetadata(metadata, navigate, flightData);
  return data != null ? {
    data
  } : undefined;
}

// The delegation fallback's lazy entry (see data/events.ts). Nothing imports
// this module statically — it exists so the dynamic import has a target that
// bundlers can keep as a split point: router-only apps never load the action
// machinery unless a server-action form actually submits.

var serverForms = /*#__PURE__*/Object.freeze({
  __proto__: null,
  submitServerForm: submitServerForm
});

console.log(createRouter({ routes: [{ path: "/" }] }));
