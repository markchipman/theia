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

const path = require('path');
const packageJson = require('../../package.json');
const debugAdapterDir = packageJson['debugAdapter']['dir'];

import { injectable } from 'inversify';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-common';
import { DebugAdapterContribution, DebugAdapterExecutable } from '@theia/debug/lib/node/debug-model';

@injectable()
export class NodeJsDebugAdapterContribution implements DebugAdapterContribution {
    readonly debugType = 'node';

    provideDebugConfigurations = [{
        type: this.debugType,
        breakpoints: { filePatterns: ['[.]js$', '[.]ts$'] },
        request: 'attach',
        name: 'Attach by PID',
        processId: ''
    }];

    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration {
        config.breakpoints = { filePatterns: ['[.]js$', '[.]ts$'] };

        if (!config.request) {
            throw new Error('Debug request type is not provided.');
        }

        switch (config.request) {
            case 'attach': this.validateAttachConfig(config);
        }

        return config;
    }

    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable {
        const program = path.join(__dirname, `../../${debugAdapterDir}/out/src/nodeDebug.js`);
        return {
            program,
            runtime: 'node'
        };
    }

    private validateAttachConfig(config: DebugConfiguration) {
        if (!config.processId) {
            throw new Error('PID is not provided.');
        }
    }
}
