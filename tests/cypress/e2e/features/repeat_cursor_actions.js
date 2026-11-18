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
            labels: [
                { name: 'object', type: 'rectangle', attributes: [] },
                { name: 'replacement', type: 'rectangle', attributes: [] },
                { name: 'other', type: 'rectangle', attributes: [] },
            ],
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
                    shapes: [0, 1, 2, 3].flatMap((frame) => [
                        [100, 100, 250, 250], [140, 140, 290, 290], [350, 100, 450, 250],
                    ].map((points, index) => ({
                        frame,
                        points,
                        type: 'rectangle',
                        label_id: body.results.find((label) => (
                            label.name === (frame === 3 && index === 1 ? 'other' : 'object')
                        )).id,
                        occluded: frame === 3 && index === 1,
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

    it('applies the top bar label to overlaps, follows label changes and stops with Escape', () => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat_canvas_shape').should('have.length', 3);
        cy.get('.cvat-rectangle-label-button[aria-label="Draw replacement"]').click();
        cy.get('.cvat-rectangle-label-button[aria-label="Draw replacement"]')
            .should('have.attr', 'aria-pressed', 'true');
        pointAtOverlap();
        shortcut('L', { keyCode: 76, which: 76, shiftKey: true });
        cy.get('.cvat-objects-sidebar-state-item-label-selector .ant-select-selection-item')
            .filter('[title="replacement"]').should('have.length', 2);
        shortcut('f', { keyCode: 70, which: 70 });
        cy.get('.cvat-player-frame-selector input').should('have.value', '1');
        cy.get('.cvat-objects-sidebar-state-item-label-selector .ant-select-selection-item')
            .filter('[title="replacement"]').should('have.length', 2);

        // Selecting another class must affect already visited objects without restarting repeat mode.
        shortcut('1', { keyCode: 49, which: 49 });
        cy.get('.cvat-objects-sidebar-state-item-label-selector .ant-select-selection-item')
            .filter('[title="object"]').should('have.length', 3);
        shortcut('Escape', { keyCode: 27, which: 27 });
        shortcut('f', { keyCode: 70, which: 70 });
        cy.get('.cvat-player-frame-selector input').should('have.value', '2');
        checkSaved(2, 3, 0);
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            cy.request(`/api/labels?task_id=${taskId}`).then(({ body: labels }) => {
                const replacement = labels.results.find((label) => label.name === 'replacement').id;
                expect(body.shapes.filter((shape) => shape.label_id === replacement && shape.frame === 0))
                    .to.have.length(2);
                expect(body.shapes.filter((shape) => shape.label_id === replacement && shape.frame > 0))
                    .to.have.length(0);
            });
        });
    });

    it('sets both occlusion values and deletes overlaps after seeking with a stationary pointer', () => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat_canvas_shape').should('have.length', 3);
        pointAtOverlap();
        shortcut('Q', { keyCode: 81, which: 81, shiftKey: true });
        cy.get('.cvat_canvas_shape_occluded').should('have.length', 2);
        cy.get('.cvat-repeat-action-feedback').should('contain.text', 'Applied')
            .and('contain.text', 'Marked occluded · object #').and('contain.text', 'Frame 0');
        shortcut('Q', {
            keyCode: 81, which: 81, shiftKey: true, altKey: true,
        });
        cy.get('.cvat_canvas_shape_occluded').should('not.exist');
        cy.get('.cvat-repeat-action-feedback').should('contain.text', 'Marked not occluded · object #');
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
        cy.get('.cvat-repeat-action-feedback').should('contain.text', 'Deleted · object #')
            .and('contain.text', 'Frame 1');
        shortcut('f', { keyCode: 70, which: 70 });
        cy.get('.cvat-player-frame-selector input').should('have.value', '2');
        cy.get('.cvat_canvas_shape').should('have.length', 1);
        cy.get('.ant-modal-confirm').should('not.exist');
        checkSaved(2, 1, 0);
    });

    it('limits both occlusion modes and deletion to the selected class, until deselected', () => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat-player-frame-selector input').clear();
        cy.get('.cvat-player-frame-selector input').type('3{enter}');
        cy.get('.cvat_canvas_shape').should('have.length', 3);
        const selectedClass = '.cvat-rectangle-label-button[aria-label="Draw object"]';
        cy.get(selectedClass).click();
        cy.get(selectedClass).should('have.attr', 'aria-pressed', 'true');
        pointAtOverlap();
        shortcut('Q', { keyCode: 81, which: 81, shiftKey: true });
        cy.get('.cvat_canvas_shape_occluded').should('have.length', 2);
        shortcut('Q', {
            keyCode: 81, which: 81, shiftKey: true, altKey: true,
        });
        cy.get('.cvat_canvas_shape_occluded').should('have.length', 1);
        shortcut('Backspace', { keyCode: 8, which: 8, shiftKey: true });
        cy.get('.cvat_canvas_shape').should('have.length', 2);
        cy.get(selectedClass).should('have.attr', 'aria-pressed', 'true').click();
        cy.get(selectedClass).should('have.attr', 'aria-pressed', 'false');
        pointAtOverlap();
        cy.get('.cvat_canvas_shape').should('have.length', 1);
        checkSaved(3, 1, 0);
    });
});
