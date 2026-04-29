"use client"
import { forwardRef } from "react"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { json } from "@codemirror/lang-json"
import { githubLight } from "@uiw/codemirror-theme-github"

interface JsonEditorProps {
  value: string
  onChange: (val: string) => void
  className?: string
  hasError?: boolean
}

const JsonEditor = forwardRef<ReactCodeMirrorRef, JsonEditorProps>(
  ({ value, onChange, className, hasError }, ref) => (
    <div className={`border rounded-md overflow-hidden text-xs font-mono ${hasError ? "border-red-400" : "border-gray-200"} ${className ?? ""}`}>
      <CodeMirror
        ref={ref}
        value={value}
        extensions={[json()]}
        theme={githubLight}
        onChange={onChange}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
        }}
        style={{ fontSize: "12px", minHeight: "8rem" }}
      />
    </div>
  )
)

JsonEditor.displayName = "JsonEditor"
export default JsonEditor
