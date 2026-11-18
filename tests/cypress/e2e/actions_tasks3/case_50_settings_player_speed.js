// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName, imageFileName } from '../../support/const';

context('Settings. "Player speed" option.', () => {
    const caseId = '50';

    let timeBeforePlay = 0;
    let timeAfterPlay = 0;
    let durationSlower = 0;
    let durationFastest = 0;
    let durationFast = 0;

    function changePlayerSpeed(speed) {
        cy.openSidebarSettings();
        cy.get('.cvat-player-settings-speed-select').click();
        const title = speed.charAt(0).toUpperCase() + speed.slice(1);
        cy.get(`.ant-select-dropdown:visible .ant-select-item-option[title="${title}"]`).click();
        cy.get('.cvat-player-settings-speed-select').should(
            'contain.text',
            title,
        );
    }

    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Change "Player speed" to "Slower" and measure the speed of changing frames. Go to first frame.', () => {
            changePlayerSpeed('slower');
            cy.get('.cvat-player-play-button').click();
            timeBeforePlay = Date.now();
            cy.log(timeBeforePlay);
            cy.get('.cvat-player-filename-wrapper')
                .should('have.text', `${imageFileName}_28.png`)
                .then(() => {
                    timeAfterPlay = Date.now();
                    durationSlower = timeAfterPlay - timeBeforePlay;
                });
            cy.goCheckFrameNumber(0);
        });

        it('Change "Player speed" to "Fastest" and measure the speed of changing frames. The "Slower" is expected to be slower than the "Fastest"', () => {
            changePlayerSpeed('fastest');
            cy.get('.cvat-player-play-button').click();
            timeBeforePlay = Date.now();
            cy.log(timeBeforePlay);
            cy.get('.cvat-player-filename-wrapper')
                .should('have.text', `${imageFileName}_28.png`)
                .then(() => {
                    timeAfterPlay = Date.now();
                    durationFastest = timeAfterPlay - timeBeforePlay;
                    expect(durationSlower).to.be.greaterThan(durationFastest);
                });
            cy.goCheckFrameNumber(0);
        });

        it('Change "Player speed" to "Fast" and measure the speed of changing frames. The "Slower" is expected to be slower than the "Fastest"', () => {
            changePlayerSpeed('fast');
            cy.get('.cvat-player-play-button').click();
            timeBeforePlay = Date.now();
            cy.log(timeBeforePlay);
            cy.get('.cvat-player-filename-wrapper')
                .should('have.text', `${imageFileName}_28.png`)
                .then(() => {
                    timeAfterPlay = Date.now();
                    durationFast = timeAfterPlay - timeBeforePlay;
                    expect(durationSlower).to.be.greaterThan(durationFast);
                });
        });
    });
});
