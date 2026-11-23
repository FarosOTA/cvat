// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import * as allure from 'allure-js-commons';
import { taskName } from '../../support/const';
import { AllureTag } from '../../support/const_allure';

context('Settings "Player step"', () => {
    allure.tags(AllureTag.HEAVY, AllureTag.SETTINGS);
    const caseId = '29';
    const countJumpStep = 3;
    let startFrame;

    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Change player step ', () => {
            cy.openSidebarSettings();
            cy.get('.cvat-player-settings-step').within(() => {
                cy.get('[role="spinbutton"]').clear();
                cy.get('[role="spinbutton"]').type(countJumpStep);
            });

            // get and save start frame
            cy.get('.cvat-player-frame-selector').within(() => {
                cy.get('[role="spinbutton"]')
                    .should('have.attr', 'aria-valuenow')
                    .then((valueFrameNow) => {
                        startFrame = Number(valueFrameNow);
                    });
            });
        });

        it('Jump to forward frame via GUI', () => {
            cy.get('.cvat-player-forward-button').click();
            cy.checkFrameNum(startFrame + countJumpStep);
        });

        it('Jump to backward frame via GUI', () => {
            cy.get('.cvat-player-backward-button').click();
            cy.checkFrameNum(startFrame);
        });

        it('Jump to forward frame via shortcuts', () => {
            cy.get('body').type('{v}');
            cy.checkFrameNum(startFrame + countJumpStep);
        });

        it('Jump to backward frame via shortcuts', () => {
            cy.get('body').type('{c}');
            cy.checkFrameNum(startFrame);
        });

        it('Reverses annotation navigation and playback without renumbering frames', () => {
            cy.goCheckFrameNumber(5);
            cy.openSidebarSettings();
            cy.get('.cvat-player-settings-reverse-annotation input').check();
            cy.checkFrameNum(5);
            cy.get('.cvat-player-slider').click('right');
            cy.checkFrameNum(0);
            cy.goCheckFrameNumber(5);
            cy.get('.cvat-frame-timeline-strip button').first().invoke('attr', 'aria-label').then((first) => {
                cy.get('.cvat-frame-timeline-strip button').last().invoke('attr', 'aria-label').then((last) => {
                    expect(Number(first.replace('Go to frame ', ''))).to.be.greaterThan(
                        Number(last.replace('Go to frame ', '')),
                    );
                });
            });

            cy.get('body').type('f');
            cy.checkFrameNum(4);
            cy.get('body').type('d');
            cy.checkFrameNum(5);
            cy.get('body').type('v');
            cy.checkFrameNum(2);
            cy.get('body').type('c');
            cy.checkFrameNum(5);
            cy.get('.cvat-player-forward-button').click();
            cy.checkFrameNum(2);
            cy.get('.cvat-player-backward-button').click();
            cy.checkFrameNum(5);

            cy.get('body').type(' ');
            cy.checkFrameNum(0);
            cy.get('.cvat-player-play-button').should('exist');
            cy.get('body').type('fv ');
            cy.checkFrameNum(0);
            cy.get('.cvat-player-play-button').should('exist');
            cy.get('body').type('{shift+space}');
            cy.get('.cvat-player-frame-selector input').should(($input) => {
                expect(Number($input.val())).to.be.greaterThan(0);
            });

            // Changing modes stops playback; numeric entry still uses the original frame ID.
            cy.get('.cvat-player-settings-reverse-annotation input').uncheck();
            cy.get('.cvat-player-play-button').should('exist');
            cy.goCheckFrameNumber(5);
            cy.get('body').type('f');
            cy.checkFrameNum(6);
            cy.get('.cvat-player-slider').click('left');
            cy.checkFrameNum(0);

            // Resume in the new direction while a previous playback delay is still pending.
            cy.get('.cvat-player-settings-speed-select').click();
            cy.get('.ant-select-dropdown:visible .ant-select-item-option[title="Slowest"]').click();
            cy.goCheckFrameNumber(6);
            cy.goCheckFrameNumber(5);
            cy.get('.cvat-player-play-button').click();
            cy.get('.cvat-player-settings-reverse-annotation input').check();
            cy.get('.cvat-player-play-button').click();
            cy.checkFrameNum(4);
            cy.goCheckFrameNumber(5);
            cy.get('.cvat-player-settings-reverse-annotation input').uncheck();
            cy.get('.cvat-player-settings-speed-select').click();
            cy.get('.ant-select-dropdown:visible .ant-select-item-option[title="Usual"]').click();
        });
    });
});
