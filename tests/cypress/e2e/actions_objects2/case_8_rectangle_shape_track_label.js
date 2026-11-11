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

        it('Show magnified borders on hover without clicking or changing the box', () => {
            cy.get('body').type('{esc}', { scrollBehavior: false });
            cy.get('.cvat-fit-control').click({ scrollBehavior: false });
            cy.get('#cvat_canvas_shape_5').then(([rectangle]) => {
                const geometry = ['x', 'y', 'width', 'height'].map((attr) => rectangle.getAttribute(attr));
                cy.get('#cvat_canvas_shape_5').realHover();
                cy.get('#cvat_canvas_shape_5').should('have.class', 'cvat_canvas_shape_activated');
                for (const target of ['#cvat_canvas_shape_5', '.svg_select_points_lt', '.svg_select_points_r']) {
                    cy.get(target).realHover();
                    cy.get('.cvat_canvas_cursor_magnifier').should('be.visible').and(([overlay]) => {
                        const box = rectangle.getBoundingClientRect();
                        const bounds = overlay.getBoundingClientRect();
                        const centerX = box.left + box.width / 2;
                        const centerY = box.top + box.height / 2;
                        for (const [x, y, alpha] of [
                            [centerX, box.top - 24, 255],
                            [centerX, box.bottom + 24, 255],
                            [box.left - 24, centerY, 255],
                            [box.right + 24, centerY, 255],
                            [centerX, centerY, 0],
                        ]) {
                            expect(overlay.getContext('2d').getImageData(
                                Math.floor(((x - bounds.left) * overlay.width) / bounds.width),
                                Math.floor(((y - bounds.top) * overlay.height) / bounds.height),
                                1, 1,
                            ).data[3]).to.equal(alpha);
                        }
                    });
                    cy.get('.cvat_canvas_crosshair').should('not.exist');
                }
                cy.get('.cvat-canvas-container').realHover({ position: 'topLeft' });
                cy.get('.cvat_canvas_cursor_magnifier').should('not.be.visible');
                cy.get('#cvat_canvas_shape_5').should(([shape]) => {
                    expect(['x', 'y', 'width', 'height'].map((attr) => shape.getAttribute(attr))).to.deep.equal(geometry);
                });
            });
        });

        it('Adjust border size and magnification independently and retain them when disabled', () => {
            cy.get('.cvat-objects-appearance-collapse').then(($appearance) => {
                if (!$appearance.find('.ant-collapse-item-active').length) {
                    cy.wrap($appearance).find('.ant-collapse-header').click();
                }
            });
            for (const [size, scale] of [[16, 8], [48, 2], [32, 4]]) {
                for (const [setting, value] of [['size', size], ['scale', scale]]) {
                    cy.get(`.cvat-appearance-magnifier-${setting}`).click();
                    cy.get('.ant-select-dropdown:visible').contains('.ant-select-item-option',
                        setting === 'size' ? `${value} px` : `${value}×`).click();
                }
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
                cy.get('.cvat-appearance-magnifier-editing-checkbox input').uncheck();
                cy.get('.cvat-appearance-magnifier-size input').should('not.be.disabled');
                cy.get('.cvat-appearance-magnifier-hover-checkbox input').uncheck();
                cy.get('.cvat-appearance-magnifier-size input').should('be.disabled');
                cy.get('.cvat-appearance-magnifier-scale input').should('be.disabled');
                cy.get('.cvat-appearance-magnifier-editing-checkbox input').check();
                cy.get('.cvat-appearance-magnifier-hover-checkbox input').check();
                cy.get('.cvat-appearance-magnifier-size').should('contain.text', `${size} px`);
                cy.get('.cvat-appearance-magnifier-scale').should('contain.text', `${scale}×`);
            }
            cy.openSettings();
            cy.get('.cvat-settings-modal').contains('Workspace').click();
            cy.get('.cvat-workspace-settings').should('not.contain.text', 'Magnified border')
                .and('not.contain.text', 'Crosshairs').and('not.contain.text', 'Border magnifier size');
            cy.closeSettings();
        });

        it('Control hover magnification, editing magnification, and crosshairs independently', () => {
            for (const [hover, editing] of [[false, true], [true, false], [false, false], [true, true]]) {
                cy.get('.cvat-appearance-magnifier-hover-checkbox input')[hover ? 'check' : 'uncheck']();
                cy.get('.cvat-appearance-magnifier-editing-checkbox input')[editing ? 'check' : 'uncheck']();
                cy.window().should((window) => {
                    const { workspace } = JSON.parse(window.localStorage.getItem('clientSettings'));
                    expect(workspace.cursorMagnifierHover).to.equal(hover);
                    expect(workspace.cursorMagnifier).to.equal(editing);
                });
                for (const target of ['#cvat_canvas_shape_5', '.svg_select_points_r']) {
                    cy.get('#cvat_canvas_shape_5').realHover();
                    cy.get(target).realHover();
                    cy.get('.cvat_canvas_cursor_magnifier').should(hover ? 'be.visible' : 'not.be.visible');
                    cy.get(target).click();
                    cy.get('.cvat-canvas-container').trigger('mousemove', { clientX: 500, clientY: 400 });
                    cy.get('.cvat_canvas_cursor_magnifier').should(editing ? 'be.visible' : 'not.be.visible');
                    cy.get('.cvat_canvas_crosshair').should('have.length', 2);
                    cy.get('body').type('{esc}', { scrollBehavior: false });
                }
            }
            cy.get('.cvat-appearance-editing-crosshair-checkbox input').uncheck();
            cy.get('#cvat_canvas_shape_5').realHover().click();
            cy.get('.cvat-canvas-container').trigger('mousemove', { clientX: 500, clientY: 400 });
            cy.get('.cvat_canvas_crosshair').should('not.exist');
            cy.get('.cvat_canvas_cursor_magnifier').should('be.visible');
            cy.get('body').type('{esc}', { scrollBehavior: false });
            cy.get('.cvat-appearance-editing-crosshair-checkbox input').check();
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

        for (const [part, pickup] of [['body', '@rectangle'], ['corner', '.svg_select_points_lt']]) {
            it(`Pan and double-middle fit while a rectangle ${part} is picked up, then cancel or place`, () => {
                const geometry = (shape) => ['x', 'y', 'width', 'height'].map((attr) => +shape.getAttribute(attr));
                const assertGeometry = (shape, expected) => {
                    geometry(shape).forEach((value, index) => expect(value).to.be.closeTo(expected[index], 0.15));
                };
                const assertMagnifierAligned = () => {
                    cy.get('.cvat_canvas_cursor_magnifier').should('be.visible').and(([overlay]) => {
                        const bounds = overlay.getBoundingClientRect();
                        const box = Cypress.$('#cvat_canvas_shape_5')[0].getBoundingClientRect();
                        const centerX = box.left + box.width / 2;
                        const centerY = box.top + box.height / 2;
                        for (const [x, y, alpha] of [
                            [centerX, box.top - 12, 255],
                            [centerX, box.bottom + 12, 255],
                            [box.left - 12, centerY, 255],
                            [box.right + 12, centerY, 255],
                            [centerX, centerY, 0],
                        ]) {
                            expect(overlay.getContext('2d').getImageData(
                                Math.floor(((x - bounds.left) * overlay.width) / bounds.width),
                                Math.floor(((y - bounds.top) * overlay.height) / bounds.height),
                                1, 1,
                            ).data[3]).to.equal(alpha);
                        }
                    });
                };
                cy.get('body').type('{esc}', { scrollBehavior: false });
                cy.get('.cvat-fit-control').click({ scrollBehavior: false });
                cy.get('#cvat_canvas_background').then(([background]) => {
                    const fitted = background.getBoundingClientRect();
                    // Make fit restore both scale and position, not just undo the pan.
                    cy.get('.cvat-canvas-container').trigger('wheel', {
                        clientX: fitted.left + fitted.width / 2,
                        clientY: fitted.top + fitted.height / 2,
                        deltaY: -4,
                        scrollBehavior: false,
                    });
                    cy.get('#cvat_canvas_shape_5').as('rectangle');
                    cy.get('@rectangle').then(([shape]) => {
                        const original = geometry(shape);
                        for (const cancel of [true, false]) {
                            cy.get('@rectangle').trigger('mousemove', { scrollBehavior: false });
                            cy.get('@rectangle').trigger('mouseover', { scrollBehavior: false });
                            cy.get(pickup).click({ scrollBehavior: false });
                            cy.get(pickup).then(([handle]) => {
                                const bounds = handle.getBoundingClientRect();
                                const target = {
                                    clientX: bounds.left + bounds.width / 2 + 23,
                                    clientY: bounds.top + bounds.height / 2 + 17,
                                };
                                const end = { clientX: target.clientX + 61, clientY: target.clientY + 37 };
                                cy.get('.cvat-canvas-container').trigger('mousemove', {
                                    ...target, buttons: 0, scrollBehavior: false,
                                });
                                cy.get('@rectangle').then(([rectangle]) => {
                                    const preview = geometry(rectangle);
                                    const beforePan = rectangle.getBoundingClientRect();
                                    // Target the active SVG handler, not just the canvas background.
                                    cy.get(pickup).trigger('mousedown', {
                                        ...target, button: 1, buttons: 4, scrollBehavior: false,
                                    });
                                    cy.get(pickup).trigger('mousemove', {
                                        ...end, buttons: 4, scrollBehavior: false,
                                    });
                                    // Check during the intercepted pan, before a normal move can repair the overlay.
                                    assertMagnifierAligned();
                                    cy.get(pickup).trigger('mouseup', {
                                        ...end, button: 1, buttons: 0, scrollBehavior: false,
                                    });
                                    cy.get('@rectangle').should(([panned]) => {
                                        assertGeometry(panned, preview);
                                        const boundsAfterPan = panned.getBoundingClientRect();
                                        expect(boundsAfterPan.left).to.be.closeTo(beforePan.left + 61, 1);
                                        expect(boundsAfterPan.top).to.be.closeTo(beforePan.top + 37, 1);
                                    });
                                    // A middle release must stop panning, but must not end the edit.
                                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                                        ...end, buttons: 0, scrollBehavior: false,
                                    });
                                    cy.get('@rectangle').should(([panned]) => {
                                        assertGeometry(panned, preview);
                                        const boundsAfterRelease = panned.getBoundingClientRect();
                                        expect(boundsAfterRelease.left).to.be.closeTo(beforePan.left + 61, 1);
                                    });
                                    // Native Chromium middle presses/releases must produce auxclick
                                    // with the double-click count; do not manufacture that event here.
                                    cy.get('body').realClick({
                                        x: end.clientX,
                                        y: end.clientY,
                                        button: 'middle',
                                        clickCount: 2,
                                        scrollBehavior: false,
                                    });
                                    cy.get('#cvat_canvas_background').should(([backgroundAfterFit]) => {
                                        const actual = backgroundAfterFit.getBoundingClientRect();
                                        for (const key of ['left', 'top', 'width', 'height']) {
                                            expect(actual[key]).to.be.closeTo(fitted[key], 1);
                                        }
                                    });
                                    // Fit must redraw even when the pointer remains stationary.
                                    assertMagnifierAligned();
                                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                                        ...end, buttons: 0, scrollBehavior: false,
                                    });
                                    cy.get('@rectangle').should(([afterFit]) => assertGeometry(afterFit, preview));
                                    cy.get('.cvat_canvas_crosshair').should('have.length', 2);
                                    cy.get('@rectangle').then(([afterFit]) => {
                                        const beforeResume = afterFit.getBoundingClientRect();
                                        const place = { clientX: end.clientX + 19, clientY: end.clientY + 11 };
                                        cy.get('.cvat-canvas-container').trigger('mousemove', {
                                            ...place, buttons: 0, scrollBehavior: false,
                                        });
                                        cy.get('@rectangle').should(([resumed]) => {
                                            const resumedBounds = resumed.getBoundingClientRect();
                                            expect(resumedBounds.left).to.be.closeTo(beforeResume.left + 19, 1);
                                            expect(resumedBounds.top).to.be.closeTo(beforeResume.top + 11, 1);
                                        });
                                        if (cancel) {
                                            cy.get('body').type('{esc}', { scrollBehavior: false });
                                        } else {
                                            cy.get('.cvat-canvas-container').trigger('mousedown', {
                                                ...place, button: 0, scrollBehavior: false,
                                            });
                                            cy.get('.cvat-canvas-container').trigger('mouseup', {
                                                ...place, button: 0, scrollBehavior: false,
                                            });
                                            cy.get('@rectangle').then(([placed]) => {
                                                const committed = geometry(placed);
                                                cy.get('.cvat-canvas-container').trigger('mousemove', {
                                                    clientX: place.clientX + 30,
                                                    clientY: place.clientY + 20,
                                                    buttons: 0,
                                                    scrollBehavior: false,
                                                });
                                                cy.get('@rectangle').should(([still]) => assertGeometry(still, committed));
                                            });
                                            cy.get('body').type('{ctrl}z', { scrollBehavior: false });
                                        }
                                        cy.get('@rectangle').should(([restored]) => assertGeometry(restored, original));
                                    });
                                });
                            });
                        }
                    });
                });
            });
        }

        it('Pan while holding a polygon point, then resume the point drag and release normally', () => {
            cy.get('body').type('{esc}', { scrollBehavior: false });
            cy.get('.cvat-fit-control').click({ scrollBehavior: false });
            cy.createPolygon({
                type: 'Shape',
                labelName,
                pointsMap: [{ x: 200, y: 200 }, { x: 280, y: 200 }, { x: 280, y: 280 }],
            });
            cy.get('polygon.cvat_canvas_shape').last().as('polygon');
            cy.get('@polygon').then(([polygon]) => {
                const center = polygon.ownerSVGElement.createSVGPoint();
                for (const point of polygon.points) {
                    center.x += point.x / polygon.points.length;
                    center.y += point.y / polygon.points.length;
                }
                const screen = center.matrixTransform(polygon.getScreenCTM());
                cy.get('.cvat-canvas-container').trigger('mousemove', {
                    clientX: screen.x, clientY: screen.y, scrollBehavior: false,
                });
            });
            cy.get('@polygon').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('.svg_select_points').first().then(([point]) => {
                const bounds = point.getBoundingClientRect();
                const start = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
                const target = { clientX: start.clientX + 20, clientY: start.clientY + 15 };
                const end = { clientX: target.clientX + 61, clientY: target.clientY + 37 };
                cy.wrap(point).trigger('mousedown', {
                    ...start, button: 0, buttons: 1, which: 1, scrollBehavior: false,
                });
                cy.get('.cvat-canvas-container').trigger('mousemove', {
                    ...target, buttons: 1, scrollBehavior: false,
                });
                cy.get('@polygon').then(([polygon]) => {
                    const preview = polygon.getAttribute('points');
                    const beforePan = polygon.getBoundingClientRect();
                    cy.get('.svg_select_points').first().trigger('mousedown', {
                        ...target, button: 1, buttons: 5, scrollBehavior: false,
                    });
                    cy.get('.svg_select_points').first().trigger('mousemove', {
                        ...end, buttons: 5, scrollBehavior: false,
                    });
                    cy.get('.svg_select_points').first().trigger('mouseup', {
                        ...end, button: 1, buttons: 1, scrollBehavior: false,
                    });
                    cy.get('@polygon').should(([panned]) => {
                        expect(panned.getAttribute('points')).to.equal(preview);
                        expect(panned.getBoundingClientRect().left).to.be.closeTo(beforePan.left + 61, 1);
                        expect(panned.getBoundingClientRect().top).to.be.closeTo(beforePan.top + 37, 1);
                    });
                    for (const detail of [1, 2]) {
                        cy.get('.svg_select_points').first().trigger('mousedown', {
                            ...end, button: 1, buttons: 5, detail, scrollBehavior: false,
                        });
                        cy.get('.svg_select_points').first().trigger('mouseup', {
                            ...end, button: 1, buttons: 1, detail, scrollBehavior: false,
                        });
                        cy.get('.svg_select_points').first().trigger('auxclick', {
                            ...end,
                            button: 1,
                            buttons: 1,
                            detail,
                            eventConstructor: 'MouseEvent',
                            scrollBehavior: false,
                        });
                    }
                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                        ...end, buttons: 1, scrollBehavior: false,
                    });
                    cy.get('@polygon').should('have.attr', 'points', preview);
                    cy.get('.cvat-canvas-container').trigger('mousemove', {
                        clientX: end.clientX + 13,
                        clientY: end.clientY + 9,
                        buttons: 1,
                        scrollBehavior: false,
                    });
                    cy.get('@polygon').should('not.have.attr', 'points', preview);
                    cy.get('.cvat-canvas-container').trigger('mouseup', {
                        clientX: end.clientX + 13,
                        clientY: end.clientY + 9,
                        button: 0,
                        buttons: 0,
                        scrollBehavior: false,
                    });
                    cy.get('@polygon').then(([placed]) => {
                        const committed = placed.getAttribute('points');
                        cy.get('.cvat-canvas-container').trigger('mousemove', {
                            clientX: end.clientX + 40,
                            clientY: end.clientY + 30,
                            buttons: 0,
                            scrollBehavior: false,
                        });
                        cy.get('@polygon').should('have.attr', 'points', committed);
                    });
                });
            });
        });
    });
});
