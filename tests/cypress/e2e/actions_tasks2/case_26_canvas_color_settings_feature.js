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
            cy.get('#cvat_canvas_background').should('have.attr', 'style').and('contain', 'cvat-picture-levels');
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
            cy.get('#cvat_canvas_background').should('have.attr', 'style').and('not.contain', 'cvat-picture-levels');
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
            cy.get('.cvat-image-setups-black-point input').clear();
            cy.get('.cvat-image-setups-black-point input').type('35{enter}');
            cy.get('.cvat-image-setups-white-point input').clear();
            cy.get('.cvat-image-setups-white-point input').type('190{enter}');
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
            cy.get('.cvat-canvas-image-setups-trigger').click();
            cy.get('.cvat-image-setups-black-point input').should('have.value', '35');
            cy.get('.cvat-image-setups-white-point input').should('have.value', '190');
            cy.get('#cvat_canvas_background').should('have.attr', 'style').and('contain', 'cvat-picture-levels');
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
