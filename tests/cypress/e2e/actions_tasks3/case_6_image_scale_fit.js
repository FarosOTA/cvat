// Copyright (C) 2020-2022 Intel Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName } from '../../support/const';

context('Check if the image is scaled and then fitted', () => {
    const caseId = '6';
    let scaleBefore = 0;
    let scaleAfter = 0;

    function checkFitMargin(expectedMargin) {
        cy.get('#cvat_canvas_wrapper').then(([container]) => {
            const canvas = container.getBoundingClientRect();
            cy.get('#cvat_canvas_background').should(([background]) => {
                const image = background.getBoundingClientRect();
                const margins = [
                    image.left - canvas.left,
                    canvas.right - image.right,
                    image.top - canvas.top,
                    canvas.bottom - image.bottom,
                ];
                margins.forEach((margin) => expect(margin).to.be.at.least(expectedMargin - 0.1));
                expect(Math.min(...margins)).to.be.closeTo(expectedMargin, 0.1);
            });
        });
    }

    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Scale image', () => {
            cy.get('#cvat_canvas_background')
                .should('have.attr', 'style')
                .then(($styles) => {
                    scaleBefore = Number($styles.match(/scale\((\d\.\d+)\)/m)[1]);
                });
            cy.get('.cvat-canvas-container').trigger('wheel', { deltaY: 5 });
            cy.get('#cvat_canvas_background')
                .should('have.attr', 'style')
                .then(($styles) => {
                    scaleAfter = Number($styles.match(/scale\((\d\.\d+)\)/m)[1]);
                    cy.expect(scaleBefore).to.be.greaterThan(scaleAfter);
                });
        });
        it('Fit image', () => {
            cy.get('#cvat_canvas_content').dblclick();
            cy.get('#cvat_canvas_background').should('have.attr', 'style').and('contain', scaleBefore);
            checkFitMargin(8);
        });
        it('Configure the fit margin, retain it on reload, and allow no margin', () => {
            for (const margin of [24, 0, 8]) {
                cy.openSettings();
                cy.contains('[role="tab"]', 'Workspace').click();
                cy.get('input[aria-label="Frame fit margin"]').clear();
                cy.get('input[aria-label="Frame fit margin"]').type(`${margin}`);
                cy.get('input[aria-label="Frame fit margin"]').blur();
                cy.closeSettings();
                checkFitMargin(margin);
                if (margin === 24) {
                    cy.reload();
                    cy.get('.cvat-canvas-container').should('be.visible');
                    checkFitMargin(margin);
                    cy.openSettings();
                    cy.contains('[role="tab"]', 'Workspace').click();
                    cy.get('input[aria-label="Frame fit margin"]').should('have.value', '24');
                    cy.closeSettings();
                }
            }
        });
    });
});
