// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Drawing object type and cancellation shortcuts', () => {
    let taskId;
    let jobId;

    function startDrawing(type, objectType = 'Shape', method) {
        cy.get(`.cvat-draw-${type}-control`).click();
        cy.get('.cvat-draw-shape-popover-content').filter(':visible').within(() => {
            if (method) cy.contains('.ant-radio-wrapper', method).click();
            cy.get(`.cvat-draw-${type}-${objectType.toLowerCase()}-button`).click();
        });
        cy.get(`.cvat-draw-${type}-control`).should('have.class', 'cvat-active-canvas-control');
    }

    before(() => {
        cy.prepareUserSession();
        cy.headlessCreateTask({
            name: 'Drawing shortcut regressions',
            labels: [{
                name: 'object', color: '#35c98d', type: 'any', attributes: [],
            }],
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

    it('keeps drawing active for consecutive shapes and tracks until Escape', () => {
        const tools = [
            ['rectangle', 'Shape'], ['rectangle', 'Track'], ['ellipse', 'Shape'], ['ellipse', 'Track'],
        ];
        for (const [index, [type, objectType]] of tools.entries()) {
            startDrawing(type, objectType, type === 'rectangle' ? 'By 2 Points' : undefined);
            for (let box = 0; box < 2; box++) {
                const offset = box * 100;
                cy.get('.cvat-canvas-container').click(230 + offset, 170);
                cy.get('.cvat-canvas-container').click(300 + offset, 260);
                cy.get('.cvat-objects-sidebar-state-item').should('have.length', index * 2 + box + 1);
                cy.get(`.cvat-draw-${type}-control`).should('have.class', 'cvat-active-canvas-control');
            }
            cy.get('body').type('{esc}');
            cy.get(`.cvat-draw-${type}-control`).should('not.have.class', 'cvat-active-canvas-control');
            cy.get('.cvat-canvas-container').click(550, 350);
            cy.get('.cvat-canvas-container').click(610, 410);
            cy.get('.cvat-objects-sidebar-state-item').should('have.length', (index + 1) * 2);
        }
        cy.clickSaveAnnotationView();
        cy.get('.cvat-annotation-header-save-button').should('not.have.class', 'cvat-annotation-disabled-header-button');
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            expect(body.shapes).to.have.length(4);
            expect(body.tracks).to.have.length(4);
            expect(body.shapes.map((shape) => shape.type)).to.deep.equal([
                'rectangle', 'rectangle', 'ellipse', 'ellipse',
            ]);
            expect(body.shapes.every((shape) => shape.frame === 0)).to.equal(true);
            expect(body.tracks.every((track) => track.shapes.length === 1 && track.shapes[0].frame === 0))
                .to.equal(true);
        });
        cy.request('DELETE', `/api/jobs/${jobId}/annotations`);
    });

    it('uses class-colored guides and keeps the readout southwest in every drawing direction', () => {
        cy.openSidebarSettings();
        cy.get('.cvat-appearance-drawing-dimensions-checkbox input').check();
        startDrawing('rectangle', 'Shape', 'By 2 Points');
        cy.get('.cvat_canvas_crosshair').should('have.length', 2).each(($line) => {
            cy.wrap($line).should('have.css', 'stroke', 'rgb(53, 201, 141)');
        });
        cy.get('.cvat-canvas-container').click(330, 270);

        for (const [x, y] of [[510, 390], [210, 190], [510, 190], [210, 390]]) {
            cy.get('.cvat-canvas-container').trigger('mousemove', x, y);
            cy.get('.cvat-canvas-container').then(([container]) => {
                const bounds = container.getBoundingClientRect();
                const matrix = container.ownerDocument.querySelector('#cvat_canvas_content').getScreenCTM();
                const scale = Math.hypot(matrix.a, matrix.b);
                cy.contains('#cvat_canvas_text_content text', /^object: [\d.]+x[\d.]+px$/)
                    .should(([text]) => {
                        expect(text.ownerDocument.defaultView.getComputedStyle(text).fill).to.equal('rgb(53, 201, 141)');
                        const [, width, height] = text.textContent.match(/: ([\d.]+)x([\d.]+)px$/);
                        expect(+width).to.be.closeTo(Math.abs(x - 330) / scale, 0.2);
                        expect(+height).to.be.closeTo(Math.abs(y - 270) / scale, 0.2);
                        const readout = text.getBoundingClientRect();
                        expect((bounds.left + x) - readout.right).to.be.closeTo(48, 1);
                        expect(readout.top - (bounds.top + y)).to.be.closeTo(48, 1);
                    });
            });
        }

        cy.get('body').type('{esc}');
        cy.get('#cvat_canvas_text_content text').should('not.exist');
        cy.get('.cvat-appearance-drawing-dimensions-checkbox input').uncheck();
        startDrawing('rectangle', 'Shape', 'By 2 Points');
        cy.get('.cvat-canvas-container').click(330, 270);
        cy.get('.cvat-canvas-container').trigger('mousemove', 510, 390);
        cy.get('#cvat_canvas_text_content text').should('not.exist');
        cy.get('body').type('{esc}');
        cy.get('.cvat-appearance-drawing-dimensions-checkbox input').check();
    });

    it('hides the pointer only with rectangle crosshairs and restores it after leaving or cancelling', () => {
        cy.openSidebarSettings();
        cy.get('.cvat-appearance-editing-crosshair-checkbox input').check();
        startDrawing('rectangle', 'Shape', 'By 2 Points');
        cy.get('.cvat-canvas-container').click(230, 170);
        cy.get('.cvat-canvas-container').trigger('mousemove', 410, 290);
        cy.get('.cvat_canvas_crosshair').should('be.visible');
        cy.get('#cvat_canvas_wrapper').should('have.css', 'cursor', 'none');
        cy.get('.cvat_canvas_shape_drawing').should('have.css', 'cursor', 'none');
        cy.get('#cvat_canvas_wrapper').trigger('mouseleave');
        cy.get('#cvat_canvas_wrapper').should('not.have.css', 'cursor', 'none');
        cy.get('.cvat-canvas-container').trigger('mousemove', 410, 290);
        cy.get('#cvat_canvas_wrapper').should('have.css', 'cursor', 'none');
        cy.get('body').type('{esc}');
        cy.get('#cvat_canvas_wrapper').should('not.have.css', 'cursor', 'none');

        cy.get('.cvat-appearance-editing-crosshair-checkbox input').uncheck();
        startDrawing('rectangle', 'Shape', 'By 2 Points');
        cy.get('.cvat-canvas-container').click(230, 170);
        cy.get('.cvat-canvas-container').trigger('mousemove', 410, 290);
        // Drawing guides are independent of the editing-crosshair preference.
        cy.get('.cvat_canvas_crosshair').should('be.visible');
        cy.get('#cvat_canvas_wrapper').should('have.css', 'cursor', 'none');
        cy.get('.cvat_canvas_shape_drawing').should('have.css', 'cursor', 'none');
        cy.get('body').type('{esc}');
        cy.get('#cvat_canvas_wrapper').should('not.have.css', 'cursor', 'none');
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
            cy.get('body').type('{esc}');
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

    it('deletes the new frame’s shape beneath a stationary pointer after an overlay closes', () => {
        let nextFrameShapeId;
        for (const frame of [0, 1]) {
            if (frame) cy.realPress('F');
            cy.get('.cvat-player-frame-selector input').should('have.value', `${frame}`);
            startDrawing('rectangle', 'Shape', 'By 2 Points');
            cy.get('.cvat-canvas-container').click(550, 200);
            cy.get('.cvat-canvas-container').click(720, 350);
        }
        cy.get('.cvat_canvas_shape').last().invoke('attr', 'id').then((id) => {
            nextFrameShapeId = id;
        });
        cy.realPress('D');
        cy.get('.cvat-player-frame-selector input').should('have.value', '0');
        cy.get('.cvat-canvas-container').realMouseMove(630, 270, { position: 'topLeft' });
        cy.get('.cvat_canvas_shape_activated').should('exist');

        // Model a loading overlay deterministically, without relying on network/cache timing.
        cy.document().then((doc) => {
            const overlay = doc.createElement('div');
            overlay.id = 'shortcut-loading-overlay';
            const bounds = doc.querySelector('.cvat-canvas-container').getBoundingClientRect();
            Object.assign(overlay.style, {
                position: 'fixed',
                zIndex: '10000',
                left: `${bounds.left}px`,
                top: `${bounds.top}px`,
                width: `${bounds.width}px`,
                height: `${bounds.height}px`,
            });
            doc.body.append(overlay);
        });
        cy.get('#cvat_canvas_wrapper').should('not.match', ':hover');
        cy.realPress('F');
        cy.get('.cvat-player-frame-selector input').should('have.value', '1');
        cy.get('.cvat-canvas-loading').should('not.exist');
        cy.get('#shortcut-loading-overlay').then(($overlay) => $overlay.remove());
        cy.then(() => {
            cy.get(`#${nextFrameShapeId}`).should('have.class', 'cvat_canvas_shape_activated');
            cy.realPress('DELETE');
            cy.get(`#${nextFrameShapeId}`).should('not.exist');
        });
    });

    it('advances one frame and repeats drawing, without interrupting drawing or restarting at the end', () => {
        startDrawing('rectangle', 'Shape', 'By 2 Points');
        cy.get('.cvat-canvas-container').click(230, 170);
        cy.realPress(['Control', 'N']);
        cy.get('.cvat-player-frame-selector input').should('have.value', '0');
        cy.get('.cvat-canvas-container').click(410, 310);
        cy.get('.cvat-cursor-control').should('have.class', 'cvat-active-canvas-control');

        cy.realPress(['Control', 'N']);
        cy.get('.cvat-player-frame-selector input').should('have.value', '1');
        cy.get('.cvat-draw-rectangle-control').should('have.class', 'cvat-active-canvas-control');
        cy.get('.cvat-canvas-container').click(470, 220);
        cy.get('.cvat-canvas-container').click(650, 360);
        cy.get('.cvat-cursor-control').should('have.class', 'cvat-active-canvas-control');

        cy.realPress(['Control', 'N']);
        cy.get('.cvat-player-frame-selector input').should('have.value', '1');
        cy.get('.cvat-cursor-control').should('have.class', 'cvat-active-canvas-control');
        cy.clickSaveAnnotationView();
        cy.get('.cvat-annotation-header-save-button').should('not.have.class', 'cvat-annotation-disabled-header-button');
        cy.request(`/api/jobs/${jobId}/annotations`).then(({ body }) => {
            const nextFrameShapes = body.shapes.filter((shape) => shape.frame === 1);
            expect(nextFrameShapes).to.have.length(1);
            expect(nextFrameShapes[0].type).to.equal('rectangle');
            expect(nextFrameShapes[0].label_id).to.equal(body.shapes[0].label_id);
        });
    });
});
