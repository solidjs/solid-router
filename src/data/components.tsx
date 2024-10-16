/*@refresh skip*/
import type { JSX } from "solid-js";
import { onCleanup, onMount, splitProps } from "solid-js";
import { routableForms } from "./action.js";

export interface FormProps extends JSX.FormHTMLAttributes<HTMLFormElement> {}
export function Form(props: FormProps) {
  const [, rest] = splitProps(props, ["ref"]);
  onMount(() => {
    routableForms.add(formRef)
  })
  onCleanup(() => routableForms.delete(formRef))
  let formRef: HTMLFormElement;
  return <form {...rest} ref={(el) => {
    props.ref && (props.ref as Function)(el);
    formRef = el
  }} />
}