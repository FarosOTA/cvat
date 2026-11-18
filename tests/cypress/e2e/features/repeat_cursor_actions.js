// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Repeat cursor actions', () => {
    let taskId;
    let jobId;

    before(() => {
        cy.prepareUserSession();
        cy.headlessCreateTask({
            name: 'Repeat cursor actions',
            labels: [{ name: 'object', type: 'rectangle', attributes: [] }],
            project_id: null,
            source_storage: { location: 'local' },
            target_storage: { location: 'local' },
        }, {
            server_files: ['bigArchive.zip'],
            image_quality: 70,
            use_zip_chunks: true,
            use_cache: true,
            sorting_method: 'lexicographical',
        }).then((response) => {
            taskId = response.taskId;
            [jobId] = response.jobIds;
            cy.request(`/api/labels?task_id=${taskId}`).then(({ body }) => {
                cy.request('PUT', `/api/jobs/${jobId}/annotations`, {
                    version: 0,
                    tags: [],
                    tracks: [],
                    shapes: [0, 1, 2].flatMap((frame) => [
                        [100, 100, 250, 250], [140, 140, 290, 290], [350, 100, 450, 250],
                    ].map((points) => ({
                        frame,
                        points,
                        type: 'rectangle',
                        label_id: body.results[0].id,
                        occluded: false,
                        outside: false,
                        rotation: 0,
                        z_order: 0,
                        attributes: [],
                    }))),
                });
            });
        });
    });

    after(() => {
        if (taskId) cy.headlessDeleteTask(taskId);
    });

    function shortcut(key, modifiers = {}) {
        // Unlike body.type(), this does not click outside the canvas before pressing the key.
        cy.get('body').trigger('keydown', { key, ...modifiers });
        cy.get('body').trigger('keyup', { key, ...modifiers });
    }

    function pointAtOverlap() {
        cy.get('.cvat_canvas_shape').first().then(([shape]) => {
            const rect = shape.getBoundingClientRect();
            cy.wrap(shape).trigger('mousemove', {
                clientX: rect.left + rect.width * 0.7,
                clientY: rect.top + rect.height * 0.7,
                bubbles: true,
                scrollBehavior: false,
            });
        });
    }

    function checkSaved(frame, count, occluded) {
        shortcut('Escape', { keyCode: 27, which: 27 });
        cy.clickSaveAnnotationView();
        cy.get('.cvat-annotation-header-save-button').should('not.have.class', 'cvat-annotation-disabled-header-button');
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            const shapes = body.shapes.filter((shape) => shape.frame === frame);
            expect(shapes).to.have.length(count);
            expect(shapes.filter((shape) => shape.occluded)).to.have.length(occluded);
        });
    }

    it('sets both occlusion values and deletes overlaps after seeking with a stationary pointer', () => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat_canvas_shape').should('have.length', 3);
        pointAtOverlap();
        shortcut('Q', { keyCode: 81, which: 81, shiftKey: true });
        cy.get('.cvat_canvas_shape_occluded').should('have.length', 2);
        shortcut('Q', {
            keyCode: 81, which: 81, shiftKey: true, altKey: true,
        });
        cy.get('.cvat_canvas_shape_occluded').should('not.exist');
        shortcut('Q', { keyCode: 81, which: 81, shiftKey: true });
        cy.get('.cvat_canvas_shape_occluded').should('have.length', 2);
        shortcut('f', { keyCode: 70, which: 70 });
        cy.get('.cvat-player-frame-selector input').should('have.value', '1');
        cy.get('.cvat_canvas_shape_occluded').should('have.length', 2);
        checkSaved(1, 3, 2);

        pointAtOverlap();
        shortcut('Q', {
            keyCode: 81, which: 81, shiftKey: true, altKey: true,
        });
        cy.get('.cvat_canvas_shape_occluded').should('not.exist');
        checkSaved(1, 3, 0);

        pointAtOverlap();
        shortcut('Backspace', { keyCode: 8, which: 8, shiftKey: true });
        cy.get('.cvat_canvas_shape').should('have.length', 1);
        shortcut('f', { keyCode: 70, which: 70 });
        cy.get('.cvat-player-frame-selector input').should('have.value', '2');
        cy.get('.cvat_canvas_shape').should('have.length', 1);
        cy.get('.ant-modal-confirm').should('not.exist');
        checkSaved(2, 1, 0);
    });
});
