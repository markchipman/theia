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

import {
    AbstractViewContribution,
    TabBar,
    Panel,
    TabBarRenderer,
    TabBarRendererFactory,
    SideTabBar,
    Widget,
    Message,
    VirtualWidget,
} from '@theia/core/lib/browser';
import { DebugSessionManager } from '../debug-session';
import { DebugSession } from '../debug-model';
import { DEBUG_SESSION_CONTEXT_MENU } from '../debug-command';
import { inject, injectable, postConstruct } from 'inversify';
import { DebugThreadsWidget } from './debug-threads-widget';
import { DebugStackFramesWidget } from './debug-stack-frames-widget';
import { DebugBreakpointsWidget } from './debug-breakpoints-widget';
import { DebugVariablesWidget } from './debug-variables-widget';

export const DEBUG_FACTORY_ID = 'debug';

/**
 * The panel which contains all debug target widgets.
 */
@injectable()
export class DebugWidget extends Panel {
    private readonly tabBar: SideTabBar;

    constructor(
        @inject(DebugSessionManager)
        protected readonly debugSessionManager: DebugSessionManager,
        @inject(TabBarRendererFactory)
        protected readonly tabBarRendererFactory: () => TabBarRenderer,
        @inject('Factory<DebugTargetWidget>')
        protected readonly debugTargetWidgetFactory: (debugSession: DebugSession) => DebugTargetWidget) {

        super();
        this.id = DEBUG_FACTORY_ID;
        this.title.label = 'Debug';
        this.title.closable = true;
        this.title.iconClass = 'fa fa-bug';
        this.tabBar = this.createTabBar();
        this.addClass(Styles.DEBUG_PANEL);
    }

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.onDebugSessionCreated(debugSession));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));

        this.debugSessionManager.findAll().forEach(debugSession => {
            this.onDebugSessionCreated(debugSession);
            this.tabBar.titles
                .filter(title => (title.owner as DebugTargetWidget).sessionId === debugSession.sessionId)
                .forEach(title => title.owner.update());
        });
    }

    protected onAfterAttach(msg: Message): void {
        Widget.attach(this.tabBar, this.node);
        this.tabBar.titles.forEach(title => Widget.attach(title.owner, this.node));
        super.onAfterAttach(msg);
    }

    protected onBeforeDetach(msg: Message): void {
        this.tabBar.titles.forEach(title => Widget.detach(title.owner));
        Widget.detach(this.tabBar);
        super.onBeforeDetach(msg);
    }

    protected onActivateRequest(msg: Message) {
        super.onActivateRequest(msg);
        const currentTitle = this.tabBar.currentTitle;
        this.tabBar.update(); // to redraw to tab
        if (currentTitle) {
            currentTitle.owner.activate();
        }
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.tabBar.update();
        const currentTitle = this.tabBar.currentTitle;
        if (currentTitle) {
            currentTitle.owner.update();
        }
    }

    protected onTabCloseRequested(sender: SideTabBar, { title }: TabBar.ITabCloseRequestedArgs<DebugTargetWidget>): void {
        const session = this.debugSessionManager.find(title.owner.sessionId);
        if (session) {
            session.disconnect();
        }
    }

    protected onCurrentTabChanged(sender: SideTabBar, { previousTitle, currentTitle }: TabBar.ICurrentChangedArgs<DebugTargetWidget>): void {
        if (previousTitle) {
            previousTitle.owner.hide();
        }

        if (currentTitle) {
            currentTitle.owner.show();
            this.debugSessionManager.setActiveDebugSession(currentTitle.owner.sessionId);
        }
    }

    private onDebugSessionCreated(debugSession: DebugSession): void {
        const widget = this.debugTargetWidgetFactory(debugSession);
        if (this.isAttached) {
            Widget.attach(widget, this.node);
        }
        this.tabBar.addTab(widget.title);
        this.tabBar.currentTitle = widget.title;

        debugSession.on('connected', () => {
            this.tabBar.titles
                .filter(title => (title.owner as DebugTargetWidget).sessionId === debugSession.sessionId)
                .forEach(title => title.owner.update());
        });
    }

    private onDebugSessionDestroyed(debugSession: DebugSession) {
        this.tabBar.titles
            .filter(title => (title.owner as DebugTargetWidget).sessionId === debugSession.sessionId)
            .forEach(title => {
                Widget.detach(title.owner);
                this.tabBar.removeTab(title);
            });
    }

    private createTabBar(): SideTabBar {
        const renderer = this.tabBarRendererFactory();
        const tabBar = new SideTabBar({
            orientation: 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'select-previous-tab',
            allowDeselect: false,
            tabsMovable: false,
            renderer: renderer,
            handlers: ['drag-thumb', 'keyboard', 'wheel', 'touch'],
            useBothWheelAxes: true,
            scrollYMarginOffset: 8,
            suppressScrollX: true
        });
        renderer.tabBar = tabBar;
        renderer.contextMenuPath = DEBUG_SESSION_CONTEXT_MENU;
        tabBar.addClass('theia-app-centers');
        tabBar.currentChanged.connect(this.onCurrentTabChanged, this);
        tabBar.tabCloseRequested.connect(this.onTabCloseRequested, this);
        return tabBar;
    }
}

/**
 * The debug target widget. It is used as a container
 * for the rest of widgets for the specific debug target.
 */
@injectable()
export class DebugTargetWidget extends VirtualWidget {
    readonly sessionId: string;
    private readonly widgets: Widget[];

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(DebugThreadsWidget) protected readonly threads: DebugThreadsWidget,
        @inject(DebugStackFramesWidget) protected readonly frames: DebugStackFramesWidget,
        @inject(DebugBreakpointsWidget) protected readonly breakpoints: DebugBreakpointsWidget,
        @inject(DebugVariablesWidget) protected readonly variables: DebugVariablesWidget
    ) {
        super();

        this.title.label = debugSession.configuration.name;
        this.title.closable = true;
        this.addClass(Styles.DEBUG_TARGET);
        this.sessionId = debugSession.sessionId;
        this.widgets = [this.variables, this.threads, this.frames, this.breakpoints];
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.widgets.forEach(w => w.update());
    }

    protected onAfterAttach(msg: Message): void {
        this.widgets.forEach(w => Widget.attach(w, this.node));
        super.onAfterAttach(msg);
    }

    protected onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        this.widgets.forEach(w => Widget.detach(w));
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.widgets.forEach(w => w.activate());
    }
}

@injectable()
export class DebugViewContribution extends AbstractViewContribution<DebugWidget> {
    constructor() {
        super({
            widgetId: DEBUG_FACTORY_ID,
            widgetName: 'Debug',
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: 'debug.view.toggle',
            toggleKeybinding: 'ctrlcmd+alt+d'
        });
    }
}

namespace Styles {
    export const DEBUG_PANEL = 'theia-debug-panel';
    export const DEBUG_TARGET = 'theia-debug-target';
}
