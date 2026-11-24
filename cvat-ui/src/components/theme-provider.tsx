// Copyright (C) 2026 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    createContext, useContext, useLayoutEffect, useMemo, useState,
} from 'react';
import ConfigProvider from 'antd/lib/config-provider';
import theme from 'antd/lib/theme';

import './theme.scss';

const ThemeContext = createContext({ dark: false, setDark: (_dark: boolean): void => {} });

export const useTheme = (): React.ContextType<typeof ThemeContext> => useContext(ThemeContext);

export default function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const [dark, setDark] = useState(() => {
        try {
            return localStorage.getItem('cvatTheme') === 'dark';
        } catch {
            return false;
        }
    });
    const context = useMemo(() => ({ dark, setDark }), [dark]);
    const config = useMemo(() => ({ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }), [dark]);

    useLayoutEffect(() => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        // Static Modal, notification and message APIs render outside the React tree.
        ConfigProvider.config({
            holderRender: (content) => <ConfigProvider theme={config}>{content}</ConfigProvider>,
        });
        try {
            localStorage.setItem('cvatTheme', dark ? 'dark' : 'light');
        } catch {
            // The current session can still change themes when storage is unavailable.
        }
    }, [dark, config]);

    return (
        <ThemeContext.Provider value={context}>
            <ConfigProvider theme={config}>{children}</ConfigProvider>
        </ThemeContext.Provider>
    );
}
