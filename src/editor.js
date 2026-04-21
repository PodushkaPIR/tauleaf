import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { latex } from 'codemirror-lang-latex';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

export function createEditor(parent, options = {}) {
  const state = EditorState.create({
    doc: options.initialContent || '',
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      bracketMatching(),
      indentOnInput(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      latex(),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && options.onChange) {
          options.onChange(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: 'monospace', fontSize: '13px' }
      })
    ]
  });

  return new EditorView({
    state,
    parent
  });
}

export function getValue(view) {
  return view.state.doc.toString();
}

export function setValue(view, content) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content }
  });
}
