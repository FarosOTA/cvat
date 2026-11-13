// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName, labelName } from '../../support/const';

context('Redraw feature.', () => {
    const caseId = '54';
    const createRectangleShape2Points = {
        points: 'By 2 Points',
        type: 'Shape',
        labelName,
        firstX: 150,
        firstY: 350,
        secondX: 250,
        secondY: 450,
    };
    const createCuboidShape2Points = {
        points: 'From rectangle',
        type: 'Shape',
        labelName,
        firstX: 300,
        firstY: 350,
        secondX: 400,
        secondY: 450,
    };
    const createPolygonShape = {
        reDraw: false,
        type: 'Shape',
        labelName,
        pointsMap: [
            { x: 450, y: 350 },
            { x: 550, y: 350 },
            { x: 550, y: 450 },
        ],
        complete: true,
        numberOfPoints: null,
    };
    const createPolylinesShape = {
        type: 'Shape',
        labelName,
        pointsMap: [
            { x: 600, y: 350 },
            { x: 700, y: 350 },
            { x: 700, y: 450 },
        ],
        complete: true,
        numberOfPoints: null,
    };
    const createPointsShape = {
        type: 'Shape',
        labelName,
        pointsMap: [{ x: 750, y: 400 }],
        complete: true,
        numberOfPoints: null,
    };
    const keyCodeN = 78;

    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
    });

    describe(`Testing case "${caseId}"`, () => {
        it('Draw and redraw a rectangle.', () => {
            cy.createRectangle(createRectangleShape2Points);
            cy.get('.cvat-canvas-container').trigger('mousemove', 200, 400);
            cy.get('#cvat_canvas_shape_1').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true }); // Start redraw the rectangle
            cy.get('.cvat-canvas-container').click(createRectangleShape2Points.firstX, createRectangleShape2Points.firstY - 50);
            cy.get('.cvat-canvas-container').click(createRectangleShape2Points.secondX, createRectangleShape2Points.secondY - 50);
            cy.get('.cvat_canvas_shape').then(($shape) => {
                expect($shape.length).to.be.equal(1);
            });
            cy.get('.cvat-objects-sidebar-state-item').then(($sidebarItem) => {
                expect($sidebarItem.length).to.be.equal(1);
            });
        });

        it('Draw and redraw a polygon.', () => {
            cy.createPolygon(createPolygonShape);
            cy.get('.cvat-canvas-container').trigger('mousemove', 520, 400);
            cy.get('#cvat_canvas_shape_2').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true }); // Start redraw the polygon
            createPolygonShape.pointsMap.forEach((element) => {
                cy.get('.cvat-canvas-container').click(element.x, element.y - 50);
            });
            cy.get('.cvat-canvas-container').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat-canvas-container').trigger('keyup', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat_canvas_shape').then(($shape) => {
                expect($shape.length).to.be.equal(2);
            });
            cy.get('.cvat-objects-sidebar-state-item').then(($sidebarItem) => {
                expect($sidebarItem.length).to.be.equal(2);
            });
        });

        it('Draw and redraw a polyline.', () => {
            cy.createPolyline(createPolylinesShape);
            cy.get('.cvat-canvas-container').trigger('mousemove', 700, 400);
            cy.get('#cvat_canvas_shape_3').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true }); // Start redraw the polyline
            createPolylinesShape.pointsMap.forEach((element) => {
                cy.get('.cvat-canvas-container').click(element.x, element.y - 50);
            });
            cy.get('.cvat-canvas-container').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat-canvas-container').trigger('keyup', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat_canvas_shape').then(($shape) => {
                expect($shape.length).to.be.equal(3);
            });
            cy.get('.cvat-objects-sidebar-state-item').then(($sidebarItem) => {
                expect($sidebarItem.length).to.be.equal(3);
            });
        });

        it('Draw and redraw a point.', () => {
            cy.createPoint(createPointsShape);
            cy.get('.cvat-canvas-container').trigger('mousemove', 750, 400);
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true }); // Start redraw the point
            createPointsShape.pointsMap.forEach((element) => {
                cy.get('.cvat-canvas-container').click(element.x, element.y - 50);
            });
            cy.get('.cvat-canvas-container').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat-canvas-container').trigger('keyup', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat_canvas_shape').then(($shape) => {
                expect($shape.length).to.be.equal(4);
            });
            cy.get('.cvat-objects-sidebar-state-item').then(($sidebarItem) => {
                expect($sidebarItem.length).to.be.equal(4);
            });
        });

        it('Draw and redraw a cuboid.', () => {
            cy.createCuboid(createCuboidShape2Points);
            cy.get('.cvat-canvas-container').trigger('mousemove', 350, 400);
            cy.get('#cvat_canvas_shape_5').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true }); // Start redraw the cuboid
            cy.get('.cvat-canvas-container').click(createCuboidShape2Points.firstX, createCuboidShape2Points.firstY - 50);
            cy.get('.cvat-canvas-container').click(createCuboidShape2Points.secondX, createCuboidShape2Points.secondY - 50);
            // Check issue 3219. Press "N" during the redrawing of the cuboid
            cy.get('.cvat-canvas-container').trigger('mousemove', 350, 300);
            cy.get('#cvat_canvas_shape_5').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true }); // Start redraw the cuboid
            cy.get('.cvat-canvas-container').click(createCuboidShape2Points.firstX, createCuboidShape2Points.firstY - 100);
            cy.get('.cvat-canvas-container').trigger('mousemove', createCuboidShape2Points.secondX, createCuboidShape2Points.secondY - 100);
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN' });
            cy.get('.cvat_canvas_shape_drawing').should('not.exist');
            cy.get('.cvat_canvas_shape').then(($shape) => {
                expect($shape.length).to.be.equal(5);
            });
            cy.get('.cvat-objects-sidebar-state-item').then(($sidebarItem) => {
                expect($sidebarItem.length).to.be.equal(5);
            });
        });

        ['shortcut', 'Replace box'].forEach((entry) => {
            it(`Restores a rectangle after canceling partial redraw via ${entry}.`, () => {
                cy.removeAnnotations();
                cy.createRectangle(createRectangleShape2Points);
                cy.get('.cvat-canvas-container').trigger('mousemove', 200, 400);
                cy.get('.cvat_canvas_shape').should('have.class', 'cvat_canvas_shape_activated');
                cy.get('.cvat_canvas_shape').then(($shape) => {
                    const original = ['x', 'y', 'width', 'height'].map((name) => $shape.attr(name));
                    if (entry === 'shortcut') {
                        cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true });
                    } else {
                        cy.get('.cvat-objects-sidebar-state-item').first().invoke('attr', 'id').then((id) => {
                            cy.interactAnnotationObjectMenu(`#${id}`, 'Replace box');
                        });
                    }
                    cy.get('.cvat-canvas-container').click(150, 300);
                    cy.get('body').type('{esc}');
                    cy.get('.cvat_canvas_shape').should('have.length', 1).and('be.visible')
                        .and('not.have.class', 'cvat_canvas_hidden').and(($restored) => {
                            expect(['x', 'y', 'width', 'height'].map((name) => $restored.attr(name)))
                                .to.deep.equal(original);
                        });
                });
            });
        });

        it('Does not open a vertex context menu on rectangle transform handles.', () => {
            cy.get('.cvat-canvas-container').trigger('mousemove', 200, 400);
            cy.get('.svg_select_points').first().trigger('contextmenu', { button: 2, force: true });
            cy.get('.cvat-canvas-context-menu').should('not.exist');
            cy.get('.cvat-canvas-point-context-menu').should('not.exist');
        });

        it('Leaves native copy and editable shortcuts unconsumed.', () => {
            cy.window().then((win) => {
                const paragraph = win.document.createElement('p');
                paragraph.textContent = 'Native selected text';
                win.document.body.appendChild(paragraph);
                const range = win.document.createRange();
                range.selectNodeContents(paragraph);
                win.getSelection().removeAllRanges();
                win.getSelection().addRange(range);
                const copy = new win.KeyboardEvent('keydown', {
                    key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: true, bubbles: true, cancelable: true,
                });
                paragraph.dispatchEvent(copy);
                expect(copy.defaultPrevented).to.equal(false);
                win.getSelection().removeAllRanges();
                paragraph.remove();

                ['input', 'textarea', 'select', 'div'].forEach((tag) => {
                    const editable = win.document.createElement(tag);
                    if (tag === 'div') editable.contentEditable = 'true';
                    win.document.body.appendChild(editable);
                    editable.focus();
                    const event = new win.KeyboardEvent('keydown', {
                        key: 'n', code: 'KeyN', keyCode: 78, bubbles: true, cancelable: true,
                    });
                    editable.dispatchEvent(event);
                    expect(event.defaultPrevented, tag).to.equal(false);
                    editable.remove();
                });
            });
            cy.get('.cvat_canvas_shape_drawing').should('not.exist');
        });

        it('Targets the annotation under a stationary cursor after changing frames.', () => {
            cy.removeAnnotations();
            cy.createRectangle(createRectangleShape2Points);
            let firstFrameId;
            let secondFrameId;
            let originalY;
            cy.get('.cvat_canvas_shape').invoke('attr', 'id').then((id) => { firstFrameId = id; });
            cy.goToNextFrame(1);
            cy.createRectangle({
                ...createRectangleShape2Points,
                firstX: 175,
                firstY: 375,
                secondX: 275,
                secondY: 475,
            });
            cy.get('.cvat_canvas_shape').invoke('attr', 'id').then((id) => { secondFrameId = id; });
            cy.get('.cvat_canvas_shape').invoke('attr', 'y').then((y) => { originalY = y; });
            cy.get('.cvat-canvas-container').trigger('mousemove', 200, 400);

            // Only keyboard navigation from here: no mouse move to re-activate either frame's shape.
            cy.get('body').type('d');
            cy.checkFrameNum(0);
            cy.then(() => cy.get(`#${firstFrameId}`).should('have.class', 'cvat_canvas_shape_activated'));
            cy.get('body').type('f');
            cy.checkFrameNum(1);
            cy.then(() => cy.get(`#${secondFrameId}`).should('have.class', 'cvat_canvas_shape_activated'));
            cy.get('body').trigger('keydown', { keyCode: keyCodeN, code: 'KeyN', shiftKey: true });
            cy.get('.cvat-canvas-container').click(175, 325);
            cy.get('.cvat-canvas-container').click(275, 425);
            cy.then(() => cy.get(`#${secondFrameId}`).should('be.visible').and('not.have.class', 'cvat_canvas_hidden'));
            cy.then(() => cy.get(`#${secondFrameId}`).should('not.have.attr', 'y', originalY));

            cy.get('.cvat-canvas-container').trigger('mousemove', 200, 400);
            cy.get('body').type('f');
            cy.checkFrameNum(2);
            cy.get('.cvat_canvas_shape').should('not.exist');
            cy.get('body').type('{del}');
            cy.get('body').type('d');
            cy.checkFrameNum(1);
            cy.then(() => cy.get(`#${secondFrameId}`).should('have.class', 'cvat_canvas_shape_activated'));
            cy.get('body').type('{del}');
            cy.get('.cvat_canvas_shape').should('not.exist');
            cy.get('body').type('d');
            cy.checkFrameNum(0);
            cy.then(() => cy.get(`#${firstFrameId}`).should('exist'));

            // Empty canvas must not retain the last shortcut target.
            cy.get('.cvat-canvas-container').trigger('mousemove', 200, 400);
            cy.get('.cvat_canvas_shape').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('.cvat-canvas-container').trigger('mousemove', 100, 200);
            cy.get('.cvat_canvas_shape').should('not.have.class', 'cvat_canvas_shape_activated');
            cy.get('body').type('{del}');
            cy.then(() => cy.get(`#${firstFrameId}`).should('exist'));
        });
    });
});
