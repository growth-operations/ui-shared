// Tiny tree-walker for testing hook-free components without a React renderer:
// call the component as a plain function, then expand every function-typed
// element (our mocked @hubspot/ui-extensions components and any local
// sub-components) into plain marker objects ({ component: "Text", ... }).
// React.Fragment resolves to { component: "Fragment", children }.
import React from "react";

export function resolve(node) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (React.isValidElement(node)) {
    const { type, props } = node;
    if (type === React.Fragment) {
      return { component: "Fragment", children: resolve(props.children) };
    }
    if (typeof type === "function") {
      return resolve(type(props));
    }
    return { component: String(type), ...props, children: resolve(props.children) };
  }
  if (typeof node.component === "string") {
    return { ...node, children: resolve(node.children) };
  }
  return node;
}

// Call a hook-free component with props and return the resolved marker tree.
export function renderComponent(Component, props) {
  return resolve(Component(props));
}

// Shallow variant for components whose children use hooks (BillingTab's
// sub-components): only the mocked ui-extensions markers (they carry
// displayName) and Fragments are resolved; real components are wrapped as
// { component: <name>, ...props } WITHOUT invoking them, so hookful children
// never run outside React. findAll/textOf work on the result either way.
export function shallowResolve(node) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(shallowResolve);
  if (React.isValidElement(node)) {
    const { type, props } = node;
    if (type === React.Fragment) {
      return { component: "Fragment", children: shallowResolve(props.children) };
    }
    if (typeof type === "function" && type.displayName) {
      return shallowResolve(type(props));
    }
    return {
      component:
        typeof type === "function" ? type.name || "Anonymous" : String(type),
      ...props,
      children: shallowResolve(props.children),
    };
  }
  if (typeof node.component === "string") {
    return { ...node, children: shallowResolve(node.children) };
  }
  return node;
}

export function renderShallow(Component, props) {
  return shallowResolve(Component(props));
}

// Every string/number leaf in the tree, concatenated (JSX splits text and
// interpolations into adjacent children).
export function textOf(node) {
  const out = [];
  collectText(node, out);
  return out.join("");
}

function collectText(node, out) {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return;
  }
  if (node.children != null) collectText(node.children, out);
}

// All marker nodes with the given component name, depth-first.
export function findAll(node, name, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, name, out));
    return out;
  }
  if (node.component === name) out.push(node);
  if (node.children != null) findAll(node.children, name, out);
  return out;
}
