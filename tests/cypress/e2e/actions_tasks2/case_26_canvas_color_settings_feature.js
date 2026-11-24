// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName } from '../../support/const';
import { generateString } from '../../support/utils';

context('Canvas color settings feature', () => {
    const caseId = '26';
    const countActionMoveSlider = 10;
    const defaultValueInSidebar = 100;
    const defaultValueInSetting = [
        defaultValueInSidebar,
        defaultValueInSidebar,
        defaultValueInSidebar,
    ];
    const expectedResultInSetting = [
        defaultValueInSidebar + countActionMoveSlider,
        defaultValueInSidebar + countActionMoveSlider,
        defaultValueInSidebar + countActionMoveSlider,
    ];
    const classNameSliders = [
        '.cvat-image-setups-brightness',
        '.cvat-image-setups-contrast',
        '.cvat-image-setups-saturation',
    ];

    const countActionMoveFilterSlider = 30;
    const defaultValueInSettingFilters = [
        1.0,
    ];
    const expectedResultInSettingFilters = [
        1.3,
    ];
    const filterSlidersClassNames = [
        '.cvat-image-setups-gamma',
    ];

    function checkStateValuesInBackground(expectedValue) {
        cy.get('#cvat_canvas_background')
            .should('have.attr', 'style')
            .and(
                'contain',
                `filter: brightness(${expectedValue}) contrast(${expectedValue}) saturate(${expectedValue})`,
            );
    }

    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
        cy.get('.cvat-canvas-image-setups-trigger').click();
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Invert only the image and reset inversion with the color controls', () => {
            cy.get('#cvat_canvas_content').invoke('css', 'filter').as('annotationFilter');
            cy.get('.cvat-image-setups-invert-colors input').should('not.be.checked').check();
            cy.get('#cvat_canvas_background')
                .should('have.css', 'filter', 'brightness(1) contrast(1) saturate(1) invert(1)');
            cy.get('#cvat_canvas_grid').should('have.css', 'filter', 'none');
            cy.get('@annotationFilter').then((filter) => {
                cy.get('#cvat_canvas_content').should('have.css', 'filter', filter);
            });
            cy.get('.cvat-image-setups-reset-color-settings').find('button').click();
            cy.get('.cvat-image-setups-invert-colors input').should('not.be.checked');
            cy.get('#cvat_canvas_background')
                .should('have.css', 'filter', 'brightness(1) contrast(1) saturate(1)');
        });

        it('Render adjusted levels in the display bitmap and restore the original pixels on reset', () => {
            cy.get('#cvat_canvas_background').then(([canvas]) => {
                const original = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
                const samples = [];
                const stride = Math.max(1, Math.floor((canvas.width * canvas.height) / 64)) * 4;
                for (let i = 0; i < original.data.length; i += stride) {
                    samples.push(i);
                }
                const expected = new Uint8ClampedArray(original.data);
                for (const i of samples) {
                    for (let channel = 0; channel < 3; channel++) {
                        expected[i + channel] = (original.data[i + channel] - 20) * 1.275;
                    }
                }
                expect(samples.some((i) => expected[i] !== original.data[i])).to.equal(true);
                cy.get('.cvat-image-setups-black-point input').clear();
                cy.get('.cvat-image-setups-black-point input').type('20{enter}');
                cy.get('.cvat-image-setups-white-point input').clear();
                cy.get('.cvat-image-setups-white-point input').type('220{enter}');
                cy.get('#cvat_canvas_background').should(([adjusted]) => {
                    const { data } = adjusted.getContext('2d').getImageData(0, 0, adjusted.width, adjusted.height);
                    for (const i of samples) {
                        expect(Array.from(data.slice(i, i + 4))).to.deep.equal(Array.from(expected.slice(i, i + 4)));
                    }
                });
                cy.get('.cvat-image-setups-invert-colors input').check();
                cy.get('#cvat_canvas_background').should('have.css', 'filter', 'none');
                cy.get('#cvat_canvas_background').should(([adjusted]) => {
                    const { data } = adjusted.getContext('2d').getImageData(0, 0, adjusted.width, adjusted.height);
                    for (const i of samples) {
                        expect(Array.from(data.slice(i, i + 4))).to.deep.equal([
                            255 - expected[i], 255 - expected[i + 1], 255 - expected[i + 2], expected[i + 3],
                        ]);
                    }
                });
                cy.get('.cvat-image-setups-invert-colors input').uncheck();
                cy.get('.cvat-image-setups-black-point [role="slider"]').type('{home}');
                cy.get('.cvat-image-setups-black-point input').should('have.value', '-255');
                cy.get('.cvat-image-setups-white-point [role="slider"]').type('{end}');
                cy.get('.cvat-image-setups-white-point input').should('have.value', '510');
                cy.get('#cvat_canvas_background').should(([adjusted]) => {
                    const { data } = adjusted.getContext('2d').getImageData(0, 0, adjusted.width, adjusted.height);
                    for (const i of samples) {
                        expect(Array.from(data.slice(i, i + 4))).to.deep.equal([
                            ...Array.from(original.data.slice(i, i + 3), (channel) => Math.round(85 + channel / 3)),
                            original.data[i + 3],
                        ]);
                    }
                });
                cy.get('.cvat-image-setups-reset-color-settings').find('button').click();
                cy.get('.cvat-image-setups-invert-colors input').should('not.be.checked');
                cy.get('#cvat_canvas_background').should(([reset]) => {
                    const { data } = reset.getContext('2d').getImageData(0, 0, reset.width, reset.height);
                    for (const i of samples) {
                        expect(Array.from(data.slice(i, i + 4)))
                            .to.deep.equal(Array.from(original.data.slice(i, i + 4)));
                    }
                });
            });
        });

        it('Check application of CSS filters', () => {
            const stringAction = generateString(countActionMoveSlider, 'rightarrow');
            cy.applyActionToSliders(
                '.cvat-canvas-image-setups-content', classNameSliders, stringAction,
            );
            cy.checkSlidersValues(
                '.cvat-canvas-image-setups-content', classNameSliders, expectedResultInSetting,
            );
            const expectedResultInBackground = (defaultValueInSidebar + countActionMoveSlider) / 100;
            checkStateValuesInBackground(expectedResultInBackground);
        });

        it('Check application of image processing filters', () => {
            const stringAction = generateString(countActionMoveFilterSlider, 'rightarrow');
            cy.applyActionToSliders(
                '.cvat-image-setups-filters', filterSlidersClassNames, stringAction,
            );
            cy.checkSlidersValues(
                '.cvat-image-setups-filters', filterSlidersClassNames, expectedResultInSettingFilters,
            );
            cy.get('.cvat-notification-notice-image-processing-error').should('not.exist');
        });

        it('Adjust black and white points without closing the panel while annotating', () => {
            cy.get('.cvat-image-setups-black-point input').clear();
            cy.get('.cvat-image-setups-black-point input').type('20{enter}');
            cy.get('.cvat-image-setups-white-point input').clear();
            cy.get('.cvat-image-setups-white-point input').type('220{enter}');
            cy.get('#cvat_canvas_background').should('have.css', 'filter', 'none');
            cy.get('.cvat-image-setups-black-point [role="slider"]').should('have.attr', 'aria-valuemax', '219');
            cy.get('.cvat-image-setups-white-point [role="slider"]').should('have.attr', 'aria-valuemin', '21');
            cy.get('.cvat-canvas-container').click('topRight');
            cy.get('#cvat-picture-controls-panel').should('be.visible');
            cy.get('.cvat-image-setups-black-point input').focus();
            cy.get('.cvat-image-setups-black-point input').type('{esc}');
            cy.get('.cvat-canvas-image-setups-trigger').should('be.focused').and('have.attr', 'aria-expanded', 'false');
            cy.get('.cvat-canvas-image-setups-trigger').click();
        });

        it('Check reset of settings', () => {
            cy.get('.cvat-image-setups-reset-color-settings').find('button').click();
            const expectedResultInBackground = defaultValueInSidebar / 100;
            checkStateValuesInBackground(expectedResultInBackground);
            cy.get('#cvat_canvas_background').should('have.css', 'filter', 'brightness(1) contrast(1) saturate(1)');
            cy.get('.cvat-image-setups-black-point input').should('have.value', '0');
            cy.get('.cvat-image-setups-white-point input').should('have.value', '255');
            cy.checkSlidersValues(
                '.cvat-canvas-image-setups-content', classNameSliders, defaultValueInSetting,
            );
            cy.checkSlidersValues(
                '.cvat-image-setups-filters', filterSlidersClassNames, defaultValueInSettingFilters,
            );
        });

        it('Check persisting image filters across jobs', () => {
            cy.get('.cvat-image-setups-invert-colors input').check();
            cy.get('.cvat-image-setups-black-point input').clear();
            cy.get('.cvat-image-setups-black-point input').type('-35{enter}');
            cy.get('.cvat-image-setups-white-point input').clear();
            cy.get('.cvat-image-setups-white-point input').type('310{enter}');
            const sliderAction = generateString(countActionMoveSlider, 'rightarrow');
            const filterAction = generateString(countActionMoveFilterSlider, 'rightarrow');
            cy.applyActionToSliders(
                '.cvat-canvas-image-setups-content', classNameSliders, sliderAction,
            );
            cy.applyActionToSliders(
                '.cvat-image-setups-filters', filterSlidersClassNames, filterAction,
            );
            cy.interactMenu('Open the task');
            cy.openJob(1);
            cy.reload();
            cy.get('.cvat-canvas-image-setups-trigger').click();
            cy.get('.cvat-image-setups-invert-colors input').should('be.checked');
            cy.get('.cvat-image-setups-black-point input').should('have.value', '-35');
            cy.get('.cvat-image-setups-white-point input').should('have.value', '310');
            cy.get('#cvat_canvas_background').should('have.css', 'filter', 'none');
            cy.checkSlidersValues(
                '.cvat-canvas-image-setups-content', classNameSliders, expectedResultInSetting,
            );
            cy.checkSlidersValues(
                '.cvat-image-setups-filters', filterSlidersClassNames, expectedResultInSettingFilters,
            );
            cy.get('.cvat-notification-notice-image-processing-error').should('not.exist');
        });
    });
});
