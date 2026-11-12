// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Quick rectangle classes', () => {
    let taskId;
    let jobId;
    let objectId;
    let labelNames;
    const classButton = (name) => `.cvat-rectangle-label-button[aria-label="Draw ${name}"]`;

    function checkObjects(expectedLabels) {
        cy.clickSaveAnnotationView();
        cy.get('.cvat-annotation-header-save-button').should('not.have.class', 'cvat-annotation-disabled-header-button');
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            expect(body.shapes.sort((a, b) => a.id - b.id).map((shape) => labelNames[shape.label_id]))
                .to.deep.equal(expectedLabels);
            expect(body.shapes.every((shape) => shape.type === 'rectangle')).to.equal(true);
            expect(body.tracks).to.have.length(0);
        });
    }

    function dropClass(name) {
        cy.get(`#cvat_canvas_shape_${objectId}`).then(([shape]) => {
            const bounds = shape.getBoundingClientRect();
            const dataTransfer = new DataTransfer();
            const event = {
                dataTransfer,
                clientX: bounds.left + bounds.width / 2,
                clientY: bounds.top + bounds.height / 2,
                scrollBehavior: false,
            };
            // Scrolling the SVG between measuring and dropping moves the box away from the pointer.
            cy.get(classButton(name)).trigger('dragstart', { dataTransfer, scrollBehavior: false });
            cy.wrap(shape).trigger('dragover', event);
            cy.wrap(shape).trigger('drop', event);
            cy.get(classButton(name)).trigger('dragend', { dataTransfer, scrollBehavior: false });
        });
    }

    before(() => {
        cy.prepareUserSession();
        cy.headlessCreateTask({
            name: 'Quick rectangle classes',
            labels: ['car', 'person', 'bike', 'bus', 'truck', 'motorcycle'].map((name) => ({
                name, type: 'rectangle', attributes: [],
            })).concat([{ name: 'polygon only', type: 'polygon', attributes: [] }]),
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
                labelNames = Object.fromEntries(body.results.map((label) => [label.id, label.name]));
            });
        });
    });

    after(() => {
        if (taskId) cy.headlessDeleteTask(taskId);
    });

    it('creates boxes by click and two-key code without relabeling the selected box', () => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat-canvas-container').should('be.visible');
        cy.get('.cvat-rectangle-label-button').should('have.length', 6);
        for (const [width, height] of [[1300, 960], [900, 700], [1300, 960]]) {
            cy.viewport(width, height);
            cy.get('.cvat-canvas-container').should(([canvas]) => {
                const bounds = canvas.getBoundingClientRect();
                const timeline = canvas.ownerDocument.querySelector('.cvat-rectangle-track-timeline');
                const image = canvas.querySelector('#cvat_canvas_background').getBoundingClientRect();
                expect(bounds.bottom).to.be.at.most(timeline.getBoundingClientRect().top);
                expect(image.top).to.be.at.least(bounds.top);
                expect(image.bottom).to.be.at.most(bounds.bottom);
            });
        }
        cy.get(classButton('motorcycle')).should('contain.text', '1 Q');
        cy.get(classButton('car')).click();
        cy.get(classButton('car')).should('have.attr', 'aria-pressed', 'true');
        cy.get('.cvat-canvas-container').click(200, 180);
        cy.get('.cvat-canvas-container').click(370, 310);
        cy.get('.cvat-objects-sidebar-state-item').should('have.length', 1).then(($objects) => {
            objectId = Number($objects[0].id.split('-').at(-1));
            cy.wrap($objects[0]).click();
        });
        cy.get('body').type('1q', { delay: 100 });
        cy.get(classButton('motorcycle')).should('have.attr', 'aria-pressed', 'true');
        checkObjects(['car']);
        cy.get('.cvat-canvas-container').click(420, 190);
        cy.get('.cvat-canvas-container').click(510, 280);
        cy.get('.cvat-objects-sidebar-state-item').should('have.length', 2);
        checkObjects(['car', 'motorcycle']);

        cy.get('body').type('12', { delay: 100 });
        cy.get(classButton('person')).should('have.attr', 'aria-pressed', 'true');
        cy.get('body').type('{esc}');
        checkObjects(['car', 'motorcycle']);
    });

    it('drops a class onto a box, preserves geometry and identity, and supports undo and locking', () => {
        let originalShape;
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            originalShape = body.shapes.find((shape) => labelNames[shape.label_id] === 'car');
        });
        dropClass('bus');
        cy.get(`#cvat-objects-sidebar-state-item-${objectId}`).should('contain.text', 'bus');
        checkObjects(['bus', 'motorcycle']);
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            const shape = body.shapes.find((candidate) => candidate.id === originalShape.id);
            expect(shape.id).to.equal(originalShape.id);
            expect(shape.points).to.deep.equal(originalShape.points);
            expect(shape.attributes).to.deep.equal(originalShape.attributes);
        });
        cy.get('.cvat-annotation-header-undo-button').click();
        cy.get(`#cvat-objects-sidebar-state-item-${objectId}`).should('contain.text', 'car');
        checkObjects(['car', 'motorcycle']);
        cy.get(`#cvat-objects-sidebar-state-item-${objectId} .cvat-object-item-button-lock`).click();
        dropClass('truck');
        checkObjects(['car', 'motorcycle']);
        cy.reload();
        cy.get('.cvat-objects-sidebar-state-item').should('have.length', 2);
        cy.contains('.cvat-objects-sidebar-state-item', 'car').should('be.visible');
        cy.contains('.cvat-objects-sidebar-state-item', 'motorcycle').should('be.visible');
        checkObjects(['car', 'motorcycle']);
    });

    it('uses the default action for class codes and right-clicks scissors without changing the default', () => {
        cy.intercept('HEAD', '**/api/lambda/functions*', { statusCode: 200 });
        cy.intercept('GET', '**/api/lambda/functions*', [{
            id: 'class-strip-test',
            name: 'Class strip segmenter',
            kind: 'interactor',
            version: 2,
            min_pos_points: 1,
            min_neg_points: 0,
            startswith_box: false,
        }]);
        cy.intercept('POST', '**/api/lambda/functions/class-strip-test', {
            delay: 1500,
            body: { shapes: [{ type: 'mask', points: [0, 600, 100, 100, 129, 119], attributes: [] }] },
        }).as('classSegment');
        cy.reload();
        cy.get('.cvat-rectangle-label-mode').should('contain.text', 'Manual rectangle');
        cy.get(classButton('person')).rightclick();
        cy.get(classButton('person')).should('have.attr', 'aria-pressed', 'true');
        cy.get('.cvat-rectangle-label-mode').should('contain.text', 'Manual rectangle');
        cy.get('.cvat-opencv-control').should('have.class', 'cvat-active-canvas-control');
        cy.get('.cvat-canvas-container').click(220, 200);
        cy.get('.cvat-canvas-container').click(350, 200);
        cy.get('.cvat-canvas-container').click(350, 290);
        cy.get('.cvat_canvas_interact_intermediate_shape').should('be.visible');
        cy.get('body').type('n');
        checkObjects(['car', 'motorcycle', 'person']);

        cy.get('.cvat-rectangle-label-mode').click();
        cy.get('.ant-select-item-option').contains('Scissors rectangle').click();
        cy.get('body').type('1q', { delay: 100 });
        cy.get(classButton('motorcycle')).should('have.attr', 'aria-pressed', 'true');
        cy.get('.cvat-opencv-control').should('have.class', 'cvat-active-canvas-control');
        cy.get('body').type('{esc}');

        cy.get('.cvat-rectangle-label-mode').click();
        cy.get('.ant-select-item-option').contains('Assisted box: Class strip segmenter').click();
        cy.get('input[aria-label="New rectangle object type"]').should('be.disabled');
        cy.get('body').type('12', { delay: 100 });
        cy.get(classButton('person')).should('have.attr', 'aria-pressed', 'true');
        cy.get('.cvat-canvas-container').click(260, 240);
        cy.get('.cvat-tracking-notice').should('be.visible');
        // Restart while a response is pending. The abandoned result and notice must not survive.
        cy.get(classButton('bus')).click();
        cy.get('.cvat-canvas-container').click(270, 250);
        cy.wait('@classSegment').its('request.body.pos_points').should('have.length', 1);
        cy.wait('@classSegment');
        cy.get('.cvat_canvas_interact_intermediate_shape').should('be.visible');
        cy.get('.cvat-tracking-notice').should('not.exist');
        cy.get('body').type('n');
        checkObjects(['car', 'motorcycle', 'person', 'bus']);
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            const box = body.shapes.find((shape) => labelNames[shape.label_id] === 'bus');
            expect(box.points).to.deep.equal([100, 100, 130, 120]);
            expect(box.source).to.equal('semi-auto');
        });
        cy.get('body').type('n');
        cy.get(classButton('bus')).should('have.attr', 'aria-pressed', 'true');
        cy.get('body').type('{esc}');
    });
});
