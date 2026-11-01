// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName, labelName } from '../../support/const';

context('Actions on rectangle', () => {
    const caseId = '8';
    const newLabelName = `New label for case ${caseId}`;
    const createRectangleShape2Points = {
        points: 'By 2 Points',
        type: 'Shape',
        labelName,
        firstX: 250,
        firstY: 350,
        secondX: 350,
        secondY: 450,
    };
    const createRectangleShape4Points = {
        points: 'By 4 Points',
        type: 'Shape',
        labelName,
        firstX: 400,
        firstY: 350,
        secondX: 500,
        secondY: 350,
        thirdX: 500,
        thirdY: 450,
        fourthX: 400,
        fourthY: 450,
    };
    const createRectangleTrack2Points = {
        points: 'By 2 Points',
        type: 'Track',
        labelName,
        firstX: createRectangleShape2Points.firstX,
        firstY: createRectangleShape2Points.firstY - 150,
        secondX: createRectangleShape2Points.secondX,
        secondY: createRectangleShape2Points.secondY - 150,
    };
    const createRectangleTrack4Points = {
        points: 'By 4 Points',
        type: 'Track',
        labelName,
        firstX: createRectangleShape4Points.firstX,
        firstY: createRectangleShape4Points.firstY - 150,
        secondX: createRectangleShape4Points.secondX - 100,
        secondY: createRectangleShape4Points.secondY - 50,
        thirdX: createRectangleShape4Points.thirdX,
        thirdY: createRectangleShape4Points.thirdY - 150,
        fourthX: createRectangleShape4Points.fourthX,
        fourthY: createRectangleShape4Points.fourthY - 150,
    };
    const createRectangleShape2PointsNewLabel = {
        labelName: newLabelName,
        points: 'By 2 Points',
        type: 'Shape',
        firstX: createRectangleShape2Points.firstX,
        firstY: createRectangleShape2Points.firstY + 150,
        secondX: createRectangleShape2Points.secondX,
        secondY: createRectangleShape2Points.secondY + 150,
    };
    const createRectangleShape4PointsNewLabel = {
        labelName: newLabelName,
        points: 'By 4 Points',
        type: 'Shape',
        firstX: createRectangleShape4Points.firstX,
        firstY: createRectangleShape4Points.firstY + 150,
        secondX: createRectangleShape4Points.secondX,
        secondY: createRectangleShape4Points.secondY + 150,
        thirdX: createRectangleShape4Points.thirdX,
        thirdY: createRectangleShape4Points.thirdY + 150,
        fourthX: createRectangleShape4Points.fourthX,
        fourthY: createRectangleShape4Points.fourthY + 150,
    };

    before(() => {
        cy.prepareUserSession();
        cy.openTask(taskName);
        cy.addNewLabel({ name: newLabelName });
        cy.openJob();
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Draw a rectangle shape in two ways (by 2 points, by 4 points)', () => {
            cy.createRectangle(createRectangleShape2Points);
            cy.createRectangle(createRectangleShape4Points);
        });

        it('Draw a rectangle track in two ways (by 2 points, by 4 points)', () => {
            cy.createRectangle(createRectangleTrack2Points);
            cy.createRectangle(createRectangleTrack4Points);
        });

        it('Draw a new rectangle shape in two ways (by 2 points, by 4 points) with second label', () => {
            cy.createRectangle(createRectangleShape2PointsNewLabel);
            cy.createRectangle(createRectangleShape4PointsNewLabel);
        });

        it('The second shape is activated if the first one was removed during the move (fix 4151).', () => {
            let xCoordinate;
            cy.get('#cvat_canvas_shape_6').trigger('mousemove');
            cy.get('#cvat_canvas_shape_6').trigger('mouseover');
            cy.get('#cvat_canvas_shape_6').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('#cvat_canvas_shape_6').trigger('mousedown', { which: 1 });
            cy.get('#cvat_canvas_shape_6').then((shape) => {
                xCoordinate = shape.attr('x');
            });
            cy.get('.cvat_canvas_text').should('have.class', 'cvat_canvas_hidden');
            cy.get('.cvat-canvas-container').trigger('mousemove', 550, 550);
            cy.get('#cvat_canvas_shape_6').then((shape) => {
                expect(Number(xCoordinate)).lt(Number(shape.attr('x')));
            });
            cy.get('body').type('{del}');
            cy.get('#cvat_canvas_shape_6').should('not.exist');
            cy.get('#cvat_canvas_shape_5').trigger('mousemove');
            cy.get('#cvat_canvas_shape_5').trigger('mouseover');
            cy.get('#cvat_canvas_shape_5').should('have.class', 'cvat_canvas_shape_activated');
        });

        it('Adjust border size and magnification independently and retain them when disabled', () => {
            cy.openSettings();
            cy.get('.cvat-settings-modal').contains('Workspace').click();
            for (const [size, scale] of [[16, 8], [48, 2], [32, 4]]) {
                for (const [setting, value] of [['size', size], ['scale', scale]]) {
                    cy.get(`.cvat-workspace-settings-magnifier-${setting}`).click();
                    cy.get('.ant-select-dropdown:visible').contains('.ant-select-item-option',
                        setting === 'size' ? `${value} px` : `${value}×`).click();
                }
                cy.closeSettings();
                cy.get('#cvat_canvas_shape_5').trigger('mousemove');
                cy.get('#cvat_canvas_shape_5').trigger('mouseover');
                cy.get('#cvat_canvas_shape_5').click();
                cy.get('#cvat_canvas_shape_5').then(([shape]) => {
                    const box = shape.getBoundingClientRect();
                    const centerX = box.left + box.width / 2;
                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                        clientX: centerX, clientY: box.top + box.height / 2, buttons: 0,
                    });
                    cy.get('.cvat_canvas_cursor_magnifier').should('be.visible').and(([overlay]) => {
                        const bounds = overlay.getBoundingClientRect();
                        const context = overlay.getContext('2d');
                        for (const [distance, alpha] of [[8 + size - 3, 255], [8 + size + 3, 0]]) {
                            const pixel = context.getImageData(
                                Math.floor(((centerX - bounds.left) * overlay.width) / bounds.width),
                                Math.floor(((box.top - distance - bounds.top) * overlay.height) / bounds.height),
                                1, 1,
                            ).data;
                            expect(pixel[3]).to.equal(alpha);
                        }
                    });
                });
                cy.get('body').type('{esc}', { scrollBehavior: false });
                cy.window().should((window) => {
                    const { workspace } = JSON.parse(window.localStorage.getItem('clientSettings'));
                    expect(workspace.cursorMagnifierSize).to.equal(size);
                    expect(workspace.cursorMagnifierScale).to.equal(scale);
                });
                cy.openSettings();
                cy.get('.cvat-workspace-settings-cursor-magnifier input').uncheck();
                cy.get('.cvat-workspace-settings-magnifier-size input').should('be.disabled');
                cy.get('.cvat-workspace-settings-magnifier-scale input').should('be.disabled');
                cy.get('.cvat-workspace-settings-cursor-magnifier input').check();
                cy.get('.cvat-workspace-settings-magnifier-size').should('contain.text', `${size} px`);
                cy.get('.cvat-workspace-settings-magnifier-scale').should('contain.text', `${scale}×`);
            }
            cy.closeSettings();
        });

        for (const {
            part, pickup, anchor, delta,
        } of [
                {
                    part: 'corner', pickup: '.svg_select_points_lt', anchor: [0, 0], delta: [43, 27, -43, -27],
                },
                {
                    part: 'body', pickup: '@rectangle', anchor: [0.5, 0.5], delta: [43, 27, 0, 0],
                },
                {
                    part: 'left edge', pickup: '.svg_select_points_l', anchor: [0, 0.5], delta: [43, 0, -43, 0],
                },
                {
                    part: 'right edge', pickup: '.svg_select_points_r', anchor: [1, 0.5], delta: [0, 0, 43, 0],
                },
                {
                    part: 'top edge', pickup: '.svg_select_points_t', anchor: [0.5, 0], delta: [0, 27, 0, -27],
                },
                {
                    part: 'bottom edge', pickup: '.svg_select_points_b', anchor: [0.5, 1], delta: [0, 0, 0, 27],
                },
            ]) {
            it(`Pick up a rectangle ${part} with a click, cancel, then click to place it`, () => {
                cy.get('body').type('{esc}', { scrollBehavior: false });
                cy.get('#cvat_canvas_wrapper').scrollTo(0, 0, { ensureScrollable: false });
                cy.get('.cvat-fit-control').click({ scrollBehavior: false });
                cy.get('#cvat_canvas_shape_5').as('rectangle');
                cy.get('@rectangle').trigger('mousemove', { scrollBehavior: false });
                cy.get('@rectangle').trigger('mouseover', { scrollBehavior: false });
                cy.get('@rectangle').should('have.class', 'cvat_canvas_shape_activated');

                cy.get('@rectangle').then(([rectangle]) => {
                    const original = rectangle.getBoundingClientRect();
                    const target = {
                        clientX: original.left + anchor[0] * original.width + 43,
                        clientY: original.top + anchor[1] * original.height + 27,
                    };

                    cy.get(pickup).click({ scrollBehavior: false });
                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                        ...target, buttons: 0, scrollBehavior: false,
                    });
                    cy.get('@rectangle').should(([shape]) => {
                        const preview = shape.getBoundingClientRect();
                        expect(preview.left).to.be.closeTo(original.left + delta[0], 2);
                        expect(preview.top).to.be.closeTo(original.top + delta[1], 2);
                        expect(preview.width).to.be.closeTo(original.width + delta[2], 2);
                        expect(preview.height).to.be.closeTo(original.height + delta[3], 2);
                    });
                    cy.get('.cvat_canvas_crosshair').should('have.length', 2);
                    cy.get('.cvat_canvas_cursor_magnifier').should('be.visible');
                    if (part === 'body') {
                        cy.get('.cvat_canvas_cursor_magnifier').should(([overlay]) => {
                            const bounds = overlay.getBoundingClientRect();
                            const box = rectangle.getBoundingClientRect();
                            const centerX = box.left + box.width / 2;
                            const centerY = box.top + box.height / 2;
                            const context = overlay.getContext('2d');
                            for (const [x, y, alpha] of [
                                [centerX, box.top - 24, 255],
                                [centerX, box.bottom + 24, 255],
                                [box.left - 24, centerY, 255],
                                [box.right + 24, centerY, 255],
                                [centerX, centerY, 0],
                            ]) {
                                const pixel = context.getImageData(
                                    Math.floor(((x - bounds.left) * overlay.width) / bounds.width),
                                    Math.floor(((y - bounds.top) * overlay.height) / bounds.height),
                                    1, 1,
                                ).data;
                                expect(pixel[3]).to.equal(alpha);
                            }
                        });
                    }
                    cy.get('body').type('{esc}', { scrollBehavior: false });
                    cy.get('.cvat_canvas_crosshair').should('not.exist');
                    cy.get('.cvat_canvas_cursor_magnifier').should('not.be.visible');
                    cy.get('@rectangle').should(([shape]) => {
                        expect(shape.getBoundingClientRect().left).to.be.closeTo(original.left, 1);
                        expect(shape.getBoundingClientRect().top).to.be.closeTo(original.top, 1);
                        expect(shape.getBoundingClientRect().width).to.be.closeTo(original.width, 1);
                        expect(shape.getBoundingClientRect().height).to.be.closeTo(original.height, 1);
                    });

                    cy.get('@rectangle').trigger('mousemove', { scrollBehavior: false });
                    cy.get('@rectangle').trigger('mouseover', { scrollBehavior: false });
                    cy.get(pickup).click({ scrollBehavior: false });
                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                        ...target, buttons: 0, scrollBehavior: false,
                    });
                    cy.get('.cvat-canvas-container').trigger('mousedown', {
                        ...target, button: 0, scrollBehavior: false,
                    });
                    cy.get('.cvat-canvas-container').trigger('mouseup', {
                        ...target, button: 0, scrollBehavior: false,
                    });
                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                        clientX: original.left - 91, clientY: original.top - 68, buttons: 0, scrollBehavior: false,
                    });
                    cy.get('@rectangle').should(([shape]) => {
                        const placed = shape.getBoundingClientRect();
                        expect(placed.left).to.be.closeTo(original.left + delta[0], 2);
                        expect(placed.top).to.be.closeTo(original.top + delta[1], 2);
                        expect(placed.width).to.be.closeTo(original.width + delta[2], 2);
                        expect(placed.height).to.be.closeTo(original.height + delta[3], 2);
                    });
                    cy.get('body').type('{ctrl}z', { scrollBehavior: false });
                    cy.get('@rectangle').should(([shape]) => {
                        expect(shape.getBoundingClientRect().left).to.be.closeTo(original.left, 1);
                        expect(shape.getBoundingClientRect().top).to.be.closeTo(original.top, 1);
                        expect(shape.getBoundingClientRect().width).to.be.closeTo(original.width, 1);
                        expect(shape.getBoundingClientRect().height).to.be.closeTo(original.height, 1);
                    });
                });
            });
        }
    });
});
