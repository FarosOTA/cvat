// Copyright (C) 2021-2022 Intel Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName, labelName } from '../../support/const';

context('Settings. "Show all interpolation tracks" option.', () => {
    const caseId = '49';
    const createRectangleTrack2Points = {
        points: 'By 2 Points',
        type: 'Track',
        labelName,
        firstX: 250,
        firstY: 350,
        secondX: 266,
        secondY: 362,
    };

    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
        cy.createRectangle(createRectangleTrack2Points);
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Flashes a small track only at its start, without thickening or changing its geometry.', () => {
            let normalWidth;
            let geometry;
            let filterOnSetup;
            let duration;
            cy.get('#cvat_canvas_shape_1').should(($shape) => {
                expect(getComputedStyle($shape[0]).filter).to.equal('none');
            }).then(($shape) => {
                const shape = $shape[0];
                normalWidth = parseFloat(getComputedStyle(shape).strokeWidth);
                geometry = ['x', 'y', 'width', 'height'].map((name) => shape.getAttribute(name));
                shape.closest('#cvat_canvas_wrapper').addEventListener('canvas.setup', () => {
                    filterOnSetup = getComputedStyle(shape).filter;
                }, { once: true });
            });
            cy.goToNextFrame(1);
            cy.then(() => expect(filterOnSetup).to.equal('none'));
            cy.get('#cvat_canvas_shape_1').should(($shape) => {
                expect(getComputedStyle($shape[0]).filter).to.equal('none');
                expect(parseFloat(getComputedStyle($shape[0]).strokeWidth)).to.equal(normalWidth);
                expect(['x', 'y', 'width', 'height'].map((name) => $shape[0].getAttribute(name)))
                    .to.deep.equal(geometry);
            });
            cy.get('#cvat_canvas_wrapper').then(($canvas) => {
                $canvas[0].addEventListener('canvas.setup', () => {
                    const shape = $canvas[0].querySelector('#cvat_canvas_shape_1');
                    const animation = shape.getAnimations().find((item) => item.id === 'cvat-annotation-appear');
                    duration = animation?.effect.getTiming().duration;
                    expect(parseFloat(getComputedStyle(shape).strokeWidth)).to.equal(normalWidth);
                }, { once: true });
            });
            cy.goToPreviousFrame(0);
            cy.then(() => expect(duration).to.equal(220));
        });

        it('Can disable annotation flashes in workspace settings.', () => {
            cy.openSettings();
            cy.contains('Workspace').click();
            cy.get('.cvat-workspace-settings-flash-annotations input').uncheck();
            cy.get('.cvat-workspace-settings-flash-annotations input').should('not.be.checked');
            cy.closeSettings();
            cy.goToNextFrame(1);
            let filterOnSetup;
            cy.get('#cvat_canvas_wrapper').then(($canvas) => {
                $canvas[0].addEventListener('canvas.setup', () => {
                    filterOnSetup = getComputedStyle($canvas[0].querySelector('#cvat_canvas_shape_1')).filter;
                }, { once: true });
            });
            cy.goToPreviousFrame(0);
            cy.then(() => expect(filterOnSetup).to.equal('none'));
            cy.openSettings();
            cy.contains('Workspace').click();
            cy.get('.cvat-workspace-settings-flash-annotations input').check();
            cy.closeSettings();
        });

        it('Switch outside property. The object is not visible. An object sidebar is visible.', () => {
            cy.get('#cvat-objects-sidebar-state-item-1').within(() => {
                cy.get('.cvat-object-item-button-outside').click();
                cy.get('.cvat-object-item-button-outside-enabled').should('exist');
            });
            cy.get('#cvat_canvas_shape_1').should('not.be.visible');
            cy.get('#cvat-objects-sidebar-state-item-1').should('be.visible');
        });

        it('On the next frame object and object sidebar does not exist.', () => {
            cy.goToNextFrame(1);
            cy.get('#cvat_canvas_shape_1').should('not.exist');
            cy.get('#cvat-objects-sidebar-state-item-1').should('not.exist');
        });

        it('Open settings. Set "Show all interpolation tracks".', () => {
            cy.openSettings();
            cy.contains('Workspace').click();
            cy.get('.cvat-workspace-settings-show-interpolated').within(() => {
                cy.get('[type="checkbox"]').check();
            });
            cy.closeSettings();
        });

        it('The object sidebar now visible on the current frame and outside property is active. The object not visible.', () => {
            cy.get('#cvat-objects-sidebar-state-item-1')
                .should('be.visible')
                .within(() => {
                    cy.get('.cvat-object-item-button-outside-enabled').should('exist');
                });
            cy.get('#cvat_canvas_shape_1').should('not.be.visible');
        });

        it('Open settings. Unset "Show all interpolation tracks". ', () => {
            cy.openSettings();
            cy.contains('Workspace').click();
            cy.get('.cvat-workspace-settings-show-interpolated').within(() => {
                cy.get('[type="checkbox"]').uncheck();
            });
            cy.closeSettings();
        });

        it('The object sidebar does not exist again. The object does not exist.', () => {
            cy.get('#cvat_canvas_shape_1').should('not.exist');
            cy.get('#cvat-objects-sidebar-state-item-1').should('not.exist');
        });

        it('Does not flash a small replacement box in the same area of the next frame.', () => {
            const box = {
                ...createRectangleTrack2Points,
                type: 'Shape',
                firstX: 450,
                firstY: 250,
                secondX: 466,
                secondY: 262,
            };
            let firstDuration;
            let replacementFilter;
            cy.get('#cvat_canvas_wrapper').then(($canvas) => {
                const onSetup = () => {
                    const shape = $canvas[0].querySelector('#cvat_canvas_shape_2');
                    if (!shape) return;
                    firstDuration = shape.getAnimations().find((item) => item.id === 'cvat-annotation-appear')
                        ?.effect.getTiming().duration;
                    $canvas[0].removeEventListener('canvas.setup', onSetup);
                };
                $canvas[0].addEventListener('canvas.setup', onSetup);
            });
            cy.createRectangle(box);
            cy.then(() => expect(firstDuration).to.equal(220));
            cy.goToNextFrame(2);
            cy.get('#cvat_canvas_wrapper').then(($canvas) => {
                const onSetup = () => {
                    const shape = $canvas[0].querySelector('#cvat_canvas_shape_3');
                    if (!shape) return;
                    replacementFilter = getComputedStyle(shape).filter;
                    $canvas[0].removeEventListener('canvas.setup', onSetup);
                };
                $canvas[0].addEventListener('canvas.setup', onSetup);
            });
            cy.createRectangle(box);
            cy.then(() => expect(replacementFilter).to.equal('none'));
        });
    });
});
