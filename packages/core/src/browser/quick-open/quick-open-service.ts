/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from './quick-open-model';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { ILogger } from '../../common/logger';

export type QuickOpenOptions = Partial<QuickOpenOptions.Resolved>;
export namespace QuickOpenOptions {
    export interface Resolved {
        readonly prefix: string;
        readonly placeholder: string;

        readonly fuzzyMatchLabel: boolean;
        readonly fuzzyMatchDetail: boolean;
        readonly fuzzyMatchDescription: boolean;
        readonly fuzzySort: boolean;

        readonly skipPrefix: boolean;

        /**
         * Whether to display the items that don't have any highlight.
         */
        readonly showItemsWithoutHighlight: boolean;

        selectIndex(lookfor: string): number;

        onClose(canceled: boolean): void;
    }
    export const defaultOptions: Resolved = Object.freeze({
        prefix: '',
        placeholder: '',

        fuzzyMatchLabel: false,
        fuzzyMatchDetail: false,
        fuzzyMatchDescription: false,
        fuzzySort: false,

        skipPrefix: false,

        showItemsWithoutHighlight: false,

        onClose: () => { /* no-op*/ },

        selectIndex: () => -1
    });
    export function resolve(options: QuickOpenOptions = {}, source: Resolved = defaultOptions): Resolved {
        return Object.assign({}, source, options);
    }
}

@injectable()
export class QuickOpenHandlerRegistry implements Disposable {

    protected readonly handlers: Map<string, QuickOpenHandler> = new Map();
    protected readonly toDispose = new DisposableCollection();
    protected defaultHandler: QuickOpenHandler;

    @inject(ILogger)
    protected readonly logger: ILogger;

    /**
     * Register the given handler.
     * Do nothing if a handler is already registered for the given id.
     */
    registerHandler(handler: QuickOpenHandler): Disposable {
        if (this.handlers.has(handler.prefix)) {
            this.logger.warn(`A handler with name ${handler.prefix} is already registered.`);
            return Disposable.NULL;
        }
        this.handlers.set(handler.prefix, handler);
        const disposable = {
            dispose: () => this.handlers.delete(handler.prefix)
        };
        this.toDispose.push(disposable);
        return disposable;
    }

    registerDefaultHandler(handler: QuickOpenHandler): Disposable {
        this.defaultHandler = handler;
        const disposable = {
            dispose: () => this.handlers.delete(handler.prefix)
        };
        this.toDispose.push(disposable);
        return disposable;
    }

    getDefaultHandler(): QuickOpenHandler {
        return this.defaultHandler;
    }

    /**
     * Return all registered handlers.
     */
    getHandlers(): QuickOpenHandler[] {
        return [...this.handlers.values()];
    }

    /**
     * Get a handler that matches the given text or `undefined` if none.
     */
    getHandlerForText(text: string): QuickOpenHandler | undefined {
        for (const handler of this.handlers.values()) {
            if (text.startsWith(handler.prefix)) {
                return handler;
            }
        }
        return undefined;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

@injectable()
export class QuickOpenService {

    protected readonly model: QuickOpenModel;
    protected currentPrefix: string;

    @inject(QuickOpenHandlerRegistry)
    protected readonly handlers: QuickOpenHandlerRegistry;

    constructor() {
        this.model = {
            onType: (lookFor: string, acceptor: (items: QuickOpenItem[]) => void) => {
                const handler = this.handlers.getHandlerForText(lookFor);

                const handlerPrefix = handler ? handler.prefix : '';
                if (handlerPrefix !== this.currentPrefix) {
                    this.currentPrefix = handlerPrefix;
                    // A prefix has been changed.
                    // The quick open widget needs to be reopened with the new prefix.
                    this.show(lookFor);
                    return;
                }

                if (handler) {
                    const searchValue = lookFor.substr(handler.prefix.length);
                    handler.getModel().then(mod => mod.onType(searchValue, handlerItems => acceptor(handlerItems)));
                } else {
                    const defHandler = this.handlers.getDefaultHandler();
                    defHandler.getModel().then(mod => mod.onType(lookFor, handlerItems => acceptor(handlerItems)));
                }
            }
        };
    }

    /**
     * Opens a quick open widget with a custom model.
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    open(model: QuickOpenModel, options?: QuickOpenOptions): void {
        // no-op
    }

    /**
     * Opens a quick open widget with a model that handles prefixes.
     */
    show1(customOpts: QuickOpenOptions): void {
        // merge the default options with the provided
        const options = QuickOpenOptions.resolve(customOpts);
        // override some options
        this.open(this.model, QuickOpenOptions.resolve({
            placeholder: 'Type ? to get help on the actions you can take from here',
            skipPrefix: true
        }, options));
    }

    /**
     * Opens a quick open widget that works with the registered quick open handlers.
     * @param prefix prefix of the quick open handler to call
     */
    show(prefix?: string): void {
        this.open(this.model, {
            prefix: prefix,
            placeholder: 'Type ? to get help on the actions you can take from here',
            fuzzyMatchLabel: true,
            fuzzySort: true,
            skipPrefix: true
        });
    }
}

export const QuickOpenContribution = Symbol('QuickOpenContribution');
/**
 * The quick open contribution should be implemented to register custom quick open handler.
 */
export interface QuickOpenContribution {
    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void;
}

export interface QuickOpenHandler {
    readonly prefix: string;
    readonly description: string;
    getModel: () => Promise<QuickOpenModel>;
}

@injectable()
export class HelpQuickOpenHandler implements QuickOpenHandler {

    readonly prefix: string = '?';
    readonly description: string = '';

    @inject(QuickOpenHandlerRegistry)
    protected readonly handlerRegistry: QuickOpenHandlerRegistry;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    async getModel(): Promise<QuickOpenModel> {
        return {
            onType: (lookFor: string, acceptor: (items: QuickOpenItem[]) => void) => {
                const items = this.handlerRegistry.getHandlers()
                    .filter(handler => handler.prefix !== this.prefix)
                    .map(handler => new QuickOpenItem({
                        label: handler.prefix,
                        description: handler.description,
                        run: (mode: QuickOpenMode) => {
                            if (mode !== QuickOpenMode.OPEN) {
                                return false;
                            }
                            this.quickOpenService.show(handler.prefix);
                            return false;
                        }
                    }));
                acceptor(items);
            }
        };
    }
}

@injectable()
export class HelpQuickOpenContribution implements QuickOpenContribution {

    @inject(HelpQuickOpenHandler)
    protected readonly helpQuickOpenHandler: HelpQuickOpenHandler;

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this.helpQuickOpenHandler);
    }
}
