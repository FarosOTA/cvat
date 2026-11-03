// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Rectangle track batch tools and edit propagation', () => {
    const taskSpec = {
        name: 'Rectangle track tools',
        labels: [{
            name: 'car',
            attributes: [],
            type: 'rectangle',
        }, {
            name: 'unused',
            attributes: [],
            type: 'rectangle',
        }, {
            name: 'box',
            attributes: [],
            type: 'rectangle',
        }],
        project_id: null,
        source_storage: { location: 'local' },
        target_storage: { location: 'local' },
    };
    const dataSpec = {
        server_files: ['bigArchive.zip'],
        image_quality: 70,
        use_zip_chunks: true,
        use_cache: true,
        sorting_method: 'lexicographical',
    };
    let taskId = null;
    let jobId = null;
    let mainTrackId = null;
    let mainPageTrackId = null;
    let removablePageTrackId = null;

    before(() => {
        cy.prepareUserSession();
        cy.headlessCreateTask(taskSpec, dataSpec).then((response) => {
            taskId = response.taskId;
            [jobId] = response.jobIds;
            cy.headlessCreateObjects([{
                labelName: 'car',
                objectType: 'track',
                frame: 0,
                source: 'auto',
                shapes: [{
                    frame: 0,
                    type: 'rectangle',
                    points: [5, 10, 25, 30],
                }, {
                    frame: 2,
                    type: 'rectangle',
                    points: [20, 20, 40, 40],
                }, {
                    frame: 4,
                    type: 'rectangle',
                    points: [30, 30, 50, 50],
                }, {
                    frame: 10,
                    type: 'rectangle',
                    points: [40, 40, 60, 60],
                    outside: true,
                }],
            }, {
                labelName: 'car',
                objectType: 'track',
                frame: 0,
                shapes: [{
                    frame: 0,
                    type: 'rectangle',
                    points: [60, 10, 80, 30],
                }, {
                    frame: 2,
                    type: 'rectangle',
                    points: [60, 10, 80, 30],
                    outside: true,
                }],
            }], jobId);
            cy.window().then(async (win) => {
                const [job] = await win.cvat.jobs.get({ jobID: jobId });
                const states = await job.annotations.get(0, true, []);
                mainTrackId = states.find((state) => state.objectType === 'track' && state.source === 'auto').clientID;
            });
        });
    });

    after(() => {
        if (taskId !== null) {
            cy.headlessDeleteTask(taskId);
        }
    });

    it('exposes track tools, a timeline, and confirmation before keyframe creation', () => {
        cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
        cy.get('.cvat-canvas-container').should('be.visible');
        cy.get('.cvat-objects-sidebar-state-item').should('have.length', 2).then(($tracks) => {
            mainPageTrackId = Number($tracks[0].id.split('-').at(-1));
            removablePageTrackId = Number($tracks[1].id.split('-').at(-1));
        });
        cy.get('.cvat-rectangle-track-timeline-header').should('be.visible');
        cy.get('.cvat-rectangle-track-timeline-header button[title^="Next annotation frame"]').click();
        cy.checkFrameNum(1);
        cy.get('.cvat-rectangle-track-timeline-header button[title^="Previous annotation frame"]').click();
        cy.checkFrameNum(0);
        cy.contains('.ant-tabs-tab', 'Track').click();
        cy.contains('.cvat-rectangle-track-tools', 'Select an unlocked rectangle track').should('be.visible');

        cy.contains('.ant-tabs-tab', 'Objects').click();
        cy.then(() => {
            cy.get(`#cvat-objects-sidebar-state-item-${mainPageTrackId}`).click();
        });
        cy.contains('.ant-tabs-tab', 'Track').click();
        cy.contains('.cvat-rectangle-track-tools', 'Canvas edit propagation').should('be.visible');
        cy.contains('.cvat-rectangle-track-tools-navigation button', 'Track end').should('not.be.disabled').click();
        cy.checkFrameNum(9);
        cy.contains('.cvat-rectangle-track-tools-navigation button', 'Track start').should('not.be.disabled').click();
        cy.checkFrameNum(0);

        cy.window().then(async (win) => {
            const [job] = await win.cvat.jobs.get({ jobID: jobId });
            await job.frames.delete(2);
        });
        cy.get('.cvat-rectangle-track-timeline-header button[title^="Next annotation frame"]').click();
        cy.checkFrameNum(1);
        cy.get('.cvat-rectangle-track-timeline-header button[title^="Next annotation frame"]').click();
        cy.checkFrameNum(3);
        cy.contains('.cvat-rectangle-track-timeline-header button', 'Track timeline').click();
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 2);
        cy.get('.cvat-rectangle-track-timeline-header .ant-select').click();
        cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="unused"]').click();
        cy.get('.cvat-rectangle-track-timeline-empty').should('be.visible');
        cy.get('.cvat-rectangle-track-timeline-row').should('not.exist');
        cy.get('.cvat-rectangle-track-timeline-header .ant-select').click();
        cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="car"]').click();
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 2);
        cy.get('.cvat-rectangle-track-timeline-header .ant-select').click();
        cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Any label"]').click();
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 2);
        cy.get('.cvat-rectangle-track-timeline-row-active .cvat-rectangle-track-timeline-segment').then(($segment) => {
            cy.wrap($segment).click($segment.width() * (2 / 9), $segment.height() / 2);
        });
        cy.checkFrameNum(1);
        cy.intercept('PATCH', `/api/jobs/${jobId}/data/meta**`).as('saveFrameMeta');
        cy.clickSaveAnnotationView();
        cy.wait('@saveFrameMeta');
        cy.get('.cvat-annotation-header-save-button').should('contain.text', 'Save');
        cy.window().then(async (win) => {
            const [job] = await win.cvat.jobs.get({ jobID: jobId });
            await job.frames.restore(2);
        });
        cy.get('.cvat-rectangle-track-timeline-header button[title^="Next annotation frame"]').click();
        cy.checkFrameNum(2);
        cy.get('.cvat-rectangle-track-timeline-header button[title^="Previous annotation frame"]').click();
        cy.checkFrameNum(1);
        cy.get('.cvat-rectangle-track-timeline-row-active .cvat-rectangle-track-timeline-segment').then(($segment) => {
            cy.wrap($segment).click($segment.width() * (2 / 9), $segment.height() / 2);
        });
        cy.checkFrameNum(2);

        cy.contains('.ant-radio-button-wrapper', 'Forward').click();
        cy.get('.cvat-rectangle-track-keyframe-toggle .ant-switch').click();
        cy.get('.ant-modal-confirm-title').should('contain.text', 'Create keyframes during propagation?');
        cy.contains('.ant-modal-confirm-btns button', 'Cancel').click();
        cy.get('.cvat-rectangle-track-keyframe-toggle .ant-switch').should('not.have.class', 'ant-switch-checked');
        cy.get('.cvat-rectangle-track-keyframe-toggle .ant-switch').click();
        cy.contains('.ant-modal-confirm-btns button', 'Enable keyframe creation').click();
        cy.get('.cvat-rectangle-track-keyframe-toggle .ant-switch').should('have.class', 'ant-switch-checked');

        cy.contains('.ant-tabs-tab', 'Objects').click();
        cy.then(() => {
            cy.interactAnnotationObjectMenu(`#cvat-objects-sidebar-state-item-${removablePageTrackId}`, 'Remove');
        });
        cy.get('.cvat-modal-confirm-remove-object').contains('button', 'Yes').click();
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 1);
        cy.goCheckFrameNumber(5);
        cy.get('.cvat-annotation-header-undo-button').click();
        cy.checkFrameNum(2);
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 2);
        cy.goCheckFrameNumber(5);
        cy.get('.cvat-annotation-header-redo-button').click();
        cy.checkFrameNum(2);
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 1);
    });

    it('transforms keyframes atomically and propagates weighted canvas edits', () => {
        cy.window().then(async (win) => {
            const [job] = await win.cvat.jobs.get({ jobID: jobId });
            const stateAt = async (frame) => {
                const states = await job.annotations.get(frame, true, []);
                return states.find((state) => state.clientID === mainTrackId);
            };
            const track = await stateAt(0);
            const trackId = track.clientID;
            const pointsAt = async (frame) => (await stateAt(frame)).points;
            const metadata = async () => (
                await job.annotations.rectangleTrackMetadata(trackId)
            )[0];

            await job.frames.delete(2);
            const batch = await job.annotations.transformRectangleTrack(track, {
                kind: 'all-keyframes',
                frame: 0,
                translation: { dx: -10, dy: 0 },
                resize: { unit: 'pixels', width: 10, height: 0 },
            });
            expect(batch.affectedKeyframes).to.equal(3);
            expect(batch.createdKeyframes).to.equal(0);
            expect(batch.state.points).to.deep.equal([0, 10, 20, 30]);
            expect(batch.state.source).to.equal('semi-auto');

            await job.frames.restore(2);
            expect(await pointsAt(2)).to.deep.equal([5, 20, 35, 40]);
            await job.actions.clear();

            const beforePercent = await stateAt(0);
            await job.annotations.transformRectangleTrack(beforePercent, {
                kind: 'all-keyframes',
                frame: 0,
                translation: { dx: 0, dy: 0 },
                resize: { unit: 'percent', width: 100, height: 0 },
            });
            expect(await pointsAt(4)).to.deep.equal([0, 30, 60, 50]);
            await job.actions.undo();
            expect(await pointsAt(4)).to.deep.equal([15, 30, 45, 50]);
            await job.actions.redo();
            expect(await pointsAt(4)).to.deep.equal([0, 30, 60, 50]);
            await job.actions.undo();
            await job.actions.clear();

            await job.frames.delete(2);
            await job.actions.clear();
            expect(await job.annotations.search(2, 4, {
                allowDeletedFrames: false,
                annotationsFilters: [],
            })).to.equal(3);
            expect(await job.annotations.search(2, 0, {
                allowDeletedFrames: false,
                annotationsFilters: [],
            })).to.equal(1);
            const propagationSource = await stateAt(0);
            const propagated = await job.annotations.transformRectangleTrack(propagationSource, {
                kind: 'canvas-edit',
                frame: 0,
                before: [0, 10, 20, 30],
                after: [10, 10, 30, 30],
                propagation: {
                    direction: 'forward',
                    radius: 4,
                    exponent: 1,
                    createKeyframes: false,
                },
            });
            expect(propagated.affectedKeyframes).to.equal(2);
            expect(propagated.createdKeyframes).to.equal(0);
            expect(await pointsAt(4)).to.deep.equal([19, 30, 49, 50]);
            expect((await metadata()).keyframes.map(({ frame }) => frame)).to.deep.equal([0, 2, 4, 10]);
            await job.actions.undo();
            expect(await pointsAt(4)).to.deep.equal([15, 30, 45, 50]);
            await job.actions.clear();

            const materializeSource = await stateAt(4);
            const materialized = await job.annotations.transformRectangleTrack(materializeSource, {
                kind: 'canvas-edit',
                frame: 4,
                before: [15, 30, 45, 50],
                after: [15, 20, 45, 60],
                propagation: {
                    direction: 'both',
                    radius: 1,
                    exponent: 1,
                    createKeyframes: true,
                },
            });
            expect(materialized.affectedKeyframes).to.equal(3);
            expect(materialized.createdKeyframes).to.equal(2);
            expect((await metadata()).keyframes.map(({ frame }) => frame)).to.deep.equal([0, 2, 3, 4, 5, 10]);
            await job.actions.undo();
            expect((await metadata()).keyframes.map(({ frame }) => frame)).to.deep.equal([0, 2, 4, 10]);
        });
    });

    it('lists standalone rectangles across frames and keeps their selection, label scope, and removal in sync', () => {
        const shapeRows = '.cvat-rectangle-track-timeline-row[data-object-type="shape"]';
        let lastFrame;
        let selectedId;
        cy.window().then(async (win) => {
            const [job] = await win.cvat.jobs.get({ jobID: jobId });
            lastFrame = job.stopFrame;
        }).then(() => {
            cy.headlessCreateObjects([0, 5, lastFrame].map((frame) => ({
                labelName: 'box',
                objectType: 'shape',
                type: 'rectangle',
                frame,
                points: [10, 15, 35, 45],
            })), jobId);
        });
        cy.reload();
        cy.contains('.cvat-rectangle-track-timeline-header button', 'Track timeline').click();
        cy.get(shapeRows).should('have.length', 3);
        cy.get('.cvat-rectangle-track-timeline-row[data-object-type="track"]').should('exist');
        cy.get('.cvat-rectangle-track-timeline-header').should('contain.text', '3 shapes');
        cy.get(`${shapeRows} .cvat-rectangle-track-timeline-segment[title="Frame 0"]`).click();
        cy.checkFrameNum(0);
        cy.get('.cvat-rectangle-track-timeline-row-active').should('have.attr', 'data-object-type', 'shape');
        cy.then(() => {
            cy.get(`${shapeRows} .cvat-rectangle-track-timeline-segment[title="Frame ${lastFrame}"]`).click();
            cy.checkFrameNum(lastFrame);
        });
        cy.get('.cvat-rectangle-track-timeline-row-active small').invoke('text').then((text) => {
            selectedId = Number(text.slice(1));
            cy.get(`#cvat_canvas_shape_${selectedId}`).should('have.class', 'cvat_canvas_shape_activated');
        });
        cy.get('.cvat-rectangle-track-timeline-header .ant-select').click();
        cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="box"]').click();
        cy.get('.cvat-rectangle-track-timeline-row').should('have.length', 3);
        cy.get('.cvat-rectangle-track-timeline-header').should('contain.text', '0 tracks');
        cy.then(() => {
            cy.interactAnnotationObjectMenu(`#cvat-objects-sidebar-state-item-${selectedId}`, 'Remove');
        });
        cy.get(shapeRows).should('have.length', 2);
        cy.get('.cvat-annotation-header-undo-button').click();
        cy.get(shapeRows).should('have.length', 3);
        cy.get('.cvat-annotation-header-redo-button').click();
        cy.get(shapeRows).should('have.length', 2);
        cy.get(`${shapeRows} .cvat-rectangle-track-timeline-segment[title="Frame 5"]`).click();
        cy.checkFrameNum(5);
        cy.get('.cvat-rectangle-track-timeline-row-active').should('have.attr', 'data-object-type', 'shape');
        cy.get('.cvat-rectangle-track-timeline-row-active small').invoke('text').then((text) => {
            const shapeId = Number(text.slice(1));
            cy.get(`#cvat-objects-sidebar-state-item-${shapeId}`)
                .find('.cvat-objects-sidebar-state-item-label-selector').click();
        });
        cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="unused"]').click();
        cy.get(shapeRows).should('have.length', 1);
        cy.get('.cvat-annotation-header-undo-button').click();
        cy.get(shapeRows).should('have.length', 2);
    });
});
