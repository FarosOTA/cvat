// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Drawing object type and cancellation shortcuts', () => {
    let taskId;
    let jobId;

    function startDrawing(type, objectType = 'Shape', method) {
        cy.get(`.cvat-draw-${type}-control`).click();
        cy.get(`.cvat-draw-${type}-popover`).filter(':visible').within(() => {
            if (method) cy.contains('.ant-radio-wrapper', method).click();
            cy.get(`.cvat-draw-${type}-${objectType.toLowerCase()}-button`).click();
        });
        cy.get(`.cvat-draw-${type}-control`).should('have.class', 'cvat-active-canvas-control');
    }

    before(() => {
        cy.prepareUserSession();
        cy.headlessCreateTask({
            name: 'Drawing shortcut regressions',
            labels: [{ name: 'object', type: 'any', attributes: [] }],
            project_id: null,
            source_storage: { location: 'local' },
            target_storage: { location: 'local' },
        }, {
            server_files: ['images/image_1.jpg', 'images/image_2.jpg'],
            image_quality: 70,
            use_zip_chunks: true,
            use_cache: true,
            sorting_method: 'lexicographical',
        }).then((response) => {
            taskId = response.taskId;
            [jobId] = response.jobIds;
        });
    });

    after(() => {
        if (taskId) cy.headlessDeleteTask(taskId);
    });

    beforeEach(() => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat-canvas-container').should('be.visible');
    });

    it('switches both ways mid-drawing without losing points or changing an existing object', () => {
        for (const [index, initialType] of ['Shape', 'Track'].entries()) {
            startDrawing('rectangle', initialType, 'By 4 Points');
            const offset = index * 80;
            cy.get('.cvat-canvas-container').click(230 + offset, 170);
            cy.get('body').type('{alt}t');
            // The remaining three clicks must complete the original four-point drawing.
            cy.get('.cvat-canvas-container').click(410 + offset, 210);
            cy.get('.cvat-canvas-container').click(370 + offset, 330);
            cy.get('.cvat-canvas-container').click(250 + offset, 290);
            cy.get('.cvat-objects-sidebar-state-item').should('have.length', index + 1);
        }
        cy.clickSaveAnnotationView();
        cy.get('.cvat-annotation-header-save-button').should('not.have.class', 'cvat-annotation-disabled-header-button');
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            expect(body.tracks).to.have.length(1);
            expect(body.shapes).to.have.length(1);
            // Distinct positions distinguish a working toggle from a no-op in both directions.
            expect(body.tracks[0].shapes[0].points[0]).to.be.lessThan(body.shapes[0].points[0]);
        });
    });

    it('discards partial drawings for each 2D geometry and rectangle/cuboid method with an editor focused', () => {
        const cases = [
            ['rectangle', 'Shape', 'By 2 Points'],
            ['rectangle', 'Track', 'By 4 Points'],
            ['polygon', 'Shape'], ['polygon', 'Track'],
            ['polyline', 'Shape'], ['points', 'Track'],
            ['ellipse', 'Shape'],
            ['cuboid', 'Shape', 'From rectangle'],
            ['cuboid', 'Track', 'By 4 Points'],
            ['mask', 'Shape'],
        ];
        for (const [type, objectType, method] of cases) {
            startDrawing(type, objectType, method);
            cy.get('.cvat-canvas-container').click(280, 230);
            if (['polygon', 'polyline', 'points'].includes(type) || method === 'By 4 Points') {
                cy.get('.cvat-canvas-container').click(380, 250);
                cy.get('.cvat-canvas-container').click(340, 330);
            }
            cy.get('.cvat-canvas-container').trigger('mousemove', 390, 340);
            // A focused editor must not swallow cancellation.
            cy.get('.cvat-player-frame-selector input').focus();
            cy.get('.cvat-player-frame-selector input').type('{esc}');
            cy.get('.cvat-cursor-control').should('have.class', 'cvat-active-canvas-control');
            cy.get('.cvat_canvas_shape_drawing').should('not.exist');
            // Clicking after cancellation must not finish or restart the old annotation.
            cy.get('.cvat-canvas-container').click(440, 380);
            cy.get('.cvat-objects-sidebar-state-item').should('have.length', 2);
        }
    });

    it('stops painting immediately when Escape is pressed with the brush button still held', () => {
        startDrawing('mask');
        cy.get('.cvat-brush-tools-brush').click();
        cy.get('.cvat-canvas-container').realMouseDown({ x: 300, y: 200, position: 'topLeft' });
        cy.get('.cvat-canvas-container').realMouseMove(400, 300, { position: 'topLeft' });
        cy.realPress('ESC');
        cy.get('.cvat-canvas-container').realMouseMove(500, 350, { position: 'topLeft' });
        cy.get('.cvat-canvas-container').realMouseUp();
        cy.get('#cvat_canvas_masks_content').should(([mask]) => {
            const pixels = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height).data;
            expect(pixels.some((value, index) => index % 4 === 3 && value !== 0)).to.equal(false);
        });
        cy.get('.cvat-objects-sidebar-state-item').should('have.length', 2);
    });
});
