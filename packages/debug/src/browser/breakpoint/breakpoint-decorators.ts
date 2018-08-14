/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import {
    Range,
    EditorDecorator,
    EditorDecorationOptions,
    TextEditor,
    Position,
    EditorManager
} from '@theia/editor/lib/browser';
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugSessionManager } from '../debug-session';
import { DebugUtils } from '../debug-utils';
import { BreakpointStorage } from './breakpoint-marker';

const ActiveLineDecoration = <EditorDecorationOptions>{
    isWholeLine: true,
    className: 'theia-debug-active-line',
};

/**
 * Highlight active debug line in the editors.
 */
@injectable()
export class ActiveLineDecorator extends EditorDecorator {
    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(EditorManager) protected readonly editorManager: EditorManager) {
        super();
    }

    applyDecorations(): void {
        this.editorManager.all.map(widget => this.setDecorations(widget.editor, []));

        const session = this.debugSessionManager.getActiveDebugSession();
        if (!session) {
            return;
        }

        for (const threadId of session.state.stoppedThreadIds) {
            session.stacks({ threadId, levels: 1 }).then(response => {
                const frame = response.body.stackFrames[0];
                if (!frame || !frame.source) {
                    return;
                }

                const uri = DebugUtils.toUri(frame.source);
                this.editorManager.getByUri(uri).then(widget => {
                    if (widget) {
                        this.doShow(widget.editor, frame);
                    }
                });
            });
        }
    }

    private doShow(editor: TextEditor, frame: DebugProtocol.StackFrame): void {
        const decoration = {
            range: this.toRange(frame),
            options: ActiveLineDecoration
        };
        this.setDecorations(editor, [decoration]);
    }

    private toRange(frame: DebugProtocol.StackFrame): Range {
        const start = Position.create(
            frame.line - 1,
            frame.endColumn ? frame.column - 1 : 0);
        const end = Position.create(
            frame.endLine ? frame.endLine - 1 : frame.line - 1,
            frame.endColumn ? frame.endColumn - 1 : 0);
        return Range.create(start, end);
    }
}

const InactiveBreakpointDecoration = <EditorDecorationOptions>{
    isWholeLine: false,
    glyphMarginClassName: 'theia-debug-inactive-breakpoint',
};

const ActiveBreakpointDecoration = <EditorDecorationOptions>{
    isWholeLine: false,
    glyphMarginClassName: 'theia-debug-active-breakpoint',
};

/**
 * Shows breakpoints.
 */
@injectable()
export class BreakpointDecorator extends EditorDecorator {
    constructor(
        @inject(BreakpointStorage) protected readonly breakpointStorage: BreakpointStorage,
        @inject(EditorManager) protected readonly editorManager: EditorManager) {
        super();
    }

    applyDecorations(editor?: TextEditor): void {
        const editors = editor ? [editor] : this.editorManager.all.map(widget => widget.editor);

        editors.forEach(e => {
            const decorations = this.breakpointStorage.get(DebugUtils.isSourceBreakpoint)
                .filter(b => DebugUtils.checkUri(b, e.uri))
                .map(b => ({
                    range: this.toRange(b.origin as DebugProtocol.SourceBreakpoint),
                    options: !!b.created && !!b.created.verified ? ActiveBreakpointDecoration : InactiveBreakpointDecoration
                }));
            this.setDecorations(e, decorations);
        });
    }

    private toRange(breakpoint: DebugProtocol.SourceBreakpoint): Range {
        return Range.create(Position.create(breakpoint.line - 1, 0), Position.create(breakpoint.line - 1, 0));
    }
}
