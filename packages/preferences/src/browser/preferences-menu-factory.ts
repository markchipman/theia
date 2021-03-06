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

import { injectable } from 'inversify';
import { Menu } from '@phosphor/widgets';
import { CommandRegistry } from '@phosphor/commands';
import { PreferenceProperty } from '@theia/core/lib/browser';

@injectable()
export class PreferencesMenuFactory {

    createPreferenceContextMenu(id: string, savedPreference: any, property: PreferenceProperty, execute: (property: string, value: any) => void): Menu {
        const commands = new CommandRegistry();
        const menu = new Menu({ commands });
        if (property) {
            const enumConst = property.enum;
            if (enumConst) {
                enumConst.forEach(enumValue => {
                    const commandId = id + '-' + enumValue;
                    if (!commands.hasCommand(commandId)) {
                        commands.addCommand(commandId, {
                            label: enumValue,
                            iconClass: savedPreference === enumValue || !savedPreference && property.default === enumValue ? 'fa fa-check' : '',
                            execute: () => execute(id, enumValue)
                        });
                        menu.addItem({
                            type: 'command',
                            command: commandId
                        });
                    }
                });
            } else if (property.type && property.type === 'boolean') {
                const commandTrue = id + '-true';
                commands.addCommand(commandTrue, {
                    label: 'true',
                    iconClass: savedPreference === 'true' || !savedPreference && property.default === true ? 'fa fa-check' : '',
                    execute: () => execute(id, 'true')
                });
                menu.addItem({
                    type: 'command',
                    command: commandTrue
                });

                const commandFalse = id + '-false';
                commands.addCommand(commandFalse, {
                    label: 'false',
                    iconClass: savedPreference === 'false' || !savedPreference && property.default === false ? 'fa fa-check' : '',
                    execute: () => execute(id, 'false')
                });
                menu.addItem({
                    type: 'command',
                    command: commandFalse
                });
            } else {
                const commandId = id + '-stringValue';
                commands.addCommand(commandId, {
                    label: 'Add Value',
                    execute: () => execute(id, property.default ? property.default : '')
                });
                menu.addItem({
                    type: 'command',
                    command: commandId
                });
            }
        }
        return menu;
    }
}
