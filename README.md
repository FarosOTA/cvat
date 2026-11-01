# Fork documentation

This is [markosnarinian/cvat](https://github.com/markosnarinian/cvat), a fork of
[CVAT Community](https://github.com/cvat-ai/cvat). The changes below extend the upstream annotation
workflow, primarily for **2D rectangular shapes and tracks**, and improve frame loading and playback.
The upstream product overview and general documentation follow this section; features described there
are not necessarily fork-specific. This checkout reports CVAT **2.74.1**.

**Contents**

- [Rectangle-track editing](#rectangle-track-editing)
- [Track timeline and navigation](#track-timeline-and-navigation)
- [Precision bounding-box controls](#precision-bounding-box-controls)
- [Frame loading, buffering, and playback](#frame-loading-buffering-and-playback)
- [Security and correctness fixes](#security-and-correctness-fixes)
- [Development setup and regression coverage](#development-setup-and-regression-coverage)

## Rectangle-track editing

In the **Standard workspace**, select an unlocked, non-ground-truth rectangle track and open the new
**Track** tab in the objects sidebar.

- **Batch translation and resizing:** Move all visible stored keyframes by an X/Y offset in pixels,
  and add or subtract width and height in pixels or percent. Resizing is centered on each box;
  for example, width `10` in percent makes each box 10% wider. Outside keyframes are skipped, but
  stored visible keyframes on deleted frames are included. The panel reports the keyframes considered.
- **Canvas edit propagation:** Apply a box movement or resize to nearby frames in the forward
  direction or both directions. Choose a frame radius and a gentle, linear, or steep falloff so that
  the effect decreases with distance from the edited frame. Propagation is **off by default**.
  When enabled, it updates the edited frame and nearby existing keyframes by default, skipping deleted
  frames and outside positions.
- **Optional keyframe creation:** Enable **Create keyframes** to also store positions on affected
  interpolated frames. A confirmation warns that this can substantially increase annotation size and
  replace interpolation with explicit keyframes; the panel estimates how many may be created.
- **Undo/redo:** Each batch or propagated transform is a single undoable action. Track identity,
  attributes, and other non-geometric annotation properties are retained.
- **Track boundaries:** Use **Track start** and **Track end** to jump to the first or last visible frame.

## Track timeline and navigation

A collapsible **Track timeline** is docked below the canvas in the 2D Standard workspace, rather than
covering the image. Expand it to see rectangle tracks, their visible segments, keyframe markers,
outside/deleted-keyframe markers, and the current playhead. Filter by label, click a track to activate
it, or click a segment to seek within it. Navigation skips deleted frames and can activate a track
that is not visible on the current frame by seeking to a nearby visible position.

Default shortcuts (customizable through CVAT's shortcut settings):

| Shortcut | Action |
| --- | --- |
| `Shift + E` | Jump to the active rectangle track's first visible frame |
| `Shift + R` | Jump to the active rectangle track's last visible frame |
| `[` / `]` | Previous / next frame containing an annotation in the timeline's label scope |
| `Shift + [` / `Shift + ]` | Activate the previous / next rectangle track in that label scope |

The annotation-frame shortcuts search annotations, not just rectangle-track keyframes.
Canvas sizing now accounts for the timeline, and the image is refitted after actual layout size
changes, including timeline expansion, window resizing, and fullscreen transitions.

## Precision bounding-box controls

- **Click to place:** Click an active box body to pick it up, move the pointer without holding the
  mouse button, and click again to place it. The same interaction works with corner and edge handles
  for resizing. Traditional press-and-hold dragging remains available.
- **Cancel safely:** Press `Esc` during a move or resize to restore the box's geometry from before
  the interaction instead of keeping the unfinished edit.
- **Editing crosshairs:** Crosshairs help align boxes while moving or resizing them.
- **Magnified borders:** While drawing or editing a box, magnified image strips along **all four
  edges** help inspect alignment without covering the box's center. This is a border overlay, not
  just a magnifying lens at the pointer.
- **Replace box:** Choose **Replace box** from an unlocked rectangle's object menu, or use
  `Shift + N` on the active object, to draw replacement geometry while retaining the same shape or
  track identity and attributes rather than deleting and recreating the annotation.

Crosshairs and magnified borders are enabled by default and can be toggled independently under
**Settings → Workspace** using **Crosshairs while editing bounding boxes** and
**Magnified border while drawing and editing bounding boxes**.

In the same section, **Border magnifier size** and **Border magnification** can be adjusted
independently. Each offers **Low**, **Medium (default)**, and **High**: strip thicknesses are
16/32/48 screen pixels, and magnification is 2×/4×/8× perpendicular to each edge. Medium preserves
the original appearance. Both choices are saved in the browser and retained when the magnifier
is disabled; the controls are disabled until it is enabled again.

## Frame loading, buffering, and playback

- **Task-quality playback by default:** Opening or seeking an image job fetches the selected image
  at normal task quality first, then fills look-ahead chunks even while paused. Existing cached
  chunks are reused. Normal task quality is the task's compressed representation, not the original
  upload's full detail.
- **Configurable client memory budget:** **Settings → Player → Look-ahead buffer multiplier** accepts
  integers from 1 to 10 (default **10**). Each step permits approximately **2 GiB** of decoded images
  and **10 chunks**, for a default ceiling of approximately **20 GiB / 100 chunks**. The setting is
  saved in the browser and takes effect when reopening a job or reloading the page. This is a budget,
  not preallocated memory or a cap on total browser/GPU memory; lower it on memory-constrained clients.
- **Optional reduced-resolution playback:** **Settings → Player → Allow reduced-resolution playback**
  is saved locally and **disabled by default**. For image jobs it uses separately cached JPEG previews
  with a maximum 512px long edge and quality 50. Preview memory scales by **64 MiB per multiplier
  step**, up to **640 MiB / 100 chunks**. Pausing refines the image to task quality after 250 ms without
  blanking it; pixel-processing tools always request task quality. This mode trades resolution and
  JPEG quality for speed and is neither lossless nor zoom-adaptive.
- **Less loading contention:** Initial image loading runs alongside independent job resources.
  Bounded preview transfers and playback priming reduce stalls; video can prime one decoded chunk
  for up to one second. Canvas resize or annotation updates no longer prematurely signal image readiness.
- **Server-side preview support and cache fixes:** The job-data API adds `type=preview_chunk` with
  `quality=compressed` for 2D image ZIP data, using normal chunk index/number and Range semantics.
  Unsupported data returns HTTP 400; the UI falls back to normal chunks when preview support is absent.
  Replacing an expired cached chunk result also clears the old queue job's expiry so the queued
  replacement is not prematurely removed.

These changes work with existing tasks without re-upload or task conversion. Source files, annotation
coordinates, exports, and existing compressed/original API responses are unchanged; video and
point-cloud representations are unchanged. Cold loads, slow networks, and preview generation can
still cause buffering.

For building and installing matching fork server/UI images on an existing deployment, memory and
version precautions, and rollback instructions, see
[Installing this fork's frame-buffering fix](#installing-this-forks-frame-buffering-fix-on-an-existing-docker-deployment).
The supplied [Compose override](docker-compose.buffering.yml) selects locally built fork images;
the general upstream quick start below clones upstream and does not install these fork changes.

## Security and correctness fixes

This fork also includes selected upstream fixes without adopting optional annotation features:

- **Safer imports and permissions:** Dataset media must remain inside the dataset root. Archive
  extraction discards symlinks and other irregular files, and backups skip them. Membership changes
  respect the requested role; organization membership alone does not expose nonmembers' user details.
  Serverless function identifiers are validated before dispatch. Datumaro includes upstream path
  traversal fixes, and the updated certificate bundle removes distrusted roots; services relying on
  those roots must use a trusted certificate chain.
- **Reliable chunk downloads:** Initial transfers use ordinary GET requests, with Range requests
  reserved for resuming partial data. A server that ignores Range restarts the transfer safely rather
  than duplicating bytes. Task/job chunk responses, including job previews, expose `X-Chunk-Size`
  as the decoded payload size independently of HTTP compression. Failed background requests preserve
  their error metadata. Existing preview fallback and progress-based retry behavior are retained.
- **Editor correctness:** Canceling a redraw restores the object, including **Replace box**.
  Bulk lock/hide changes undo together, copied skeleton tracks preserve element attributes, and
  native selected-text copying remains available. Mask edits restore fully off-image moves, preserve
  overlapped pixels on translations, and correctly refresh editing, slicing, and undo controls.
  Rectangle precision controls and the fork's playback defaults remain unchanged.
- **Task and account workflows:** Validation-mode changes keep the selected mode synchronized with
  the form; **Submit & Continue** resets quality settings together with the rest of the form.
  PDF stop frames are inclusive, with explicit zero still meaning through the final page.
  Cloud listings omit empty directory names. Email confirmation
  redirects back to the UI, model loading waits for organization initialization, and API documentation
  uses the compatible ReDoc major version.
- **Quality control:** Inherited task settings display the effective project settings and cannot be
  saved as task-local changes until inheritance is disabled. Point/skeleton requirements expose the
  existing OKS threshold. Rules referencing deleted attributes can be disabled or copied without
  inventing new attribute IDs; the editor identifies those references. The quality-report list API
  requires `target` when filtering by `task_id`, `project_id`, or `parent_id`. Parent filters support
  task → job and project → task/job combinations; clients must specify the intended report type.

## Development setup and regression coverage

- [`.agents/setup`](.agents/setup) prepares an Amp orb with native build dependencies, pinned Node.js
  and Rust toolchains, immutable Yarn workspace/Cypress installs, and separate server and REST-test
  Python environments. It reuses installed tools and cached builds, constrains the `xmlsec` build to
  the pinned `lxml` version to avoid duplicate native compilation, and reports dependency-step timings.
  Xvfb is installed so Cypress can start in the headless orb. Running the full REST/SDK suite still
  requires SDK generation/installation and the backend services, as in the CI workflow.
- [`.agents/resume`](.agents/resume) recreates the runtime `logs` and `keys` directories without
  reinstalling dependencies. Local Amp files and Python test environments are excluded from Docker
  build contexts.
- Added regression coverage includes rectangle-track editing/navigation, click-to-place and precision
  controls, preview API behavior, chunk-queue expiry, deterministic frame buffering, resumed downloads,
  and editor correctness. Run the standalone buffering suite with
  `yarn workspace cvat-core run test:frames` and download tests with
  `yarn workspace cvat-core run test:downloads`; UI and backend regressions use the repository's
  existing Cypress and Python test infrastructure.

---

[![CVAT Community header](site/content/en/images/cvat_github_header.webp)](https://app.cvat.ai)
# CVAT: Computer Vision Annotation Tool

[![Release][release-img]][release-url]
[![GitHub stars][stars-img]][stars-url]
[![License][license-img]][license-url]
[![CI][ci-img]][ci-url]
[![server pulls][docker-server-pulls-img]][docker-server-image-url]
[![ui pulls][docker-ui-pulls-img]][docker-ui-image-url]
[![CVAT Online][online-img]][online-url]
[![CVAT Enterprise][enterprise-img]][enterprise-url]
[![Status][status-img]][status-url]
[![Discord][discord-img]][discord-url]
[![Docs][docs-img]][docs-url]

[Website](https://www.cvat.ai/) ·
[Docs](https://docs.cvat.ai/docs/) ·
[Changelog](https://www.cvat.ai/resources/changelog) ·
[Tutorials](https://www.cvat.ai/resources/videos) ·
[Academy](https://www.cvat.ai/resources/academy) ·
[Blog](https://www.cvat.ai/resources/blog)

## What is CVAT Community?

**CVAT Community** is the free, self-hosted open-source edition of [CVAT](https://www.cvat.ai/) — one of
the most widely used data annotation platforms for building high-quality visual datasets for
computer vision and visual AI.
Since 2018, CVAT has become one of the best-known data annotation tools in computer vision, with a
large open-source community, millions of Docker pulls, and broad adoption across research and
production AI teams.

CVAT Community supports image, video, and 3D annotation, dataset management, team collaboration, cloud storage
integration, developer-friendly SDKs and APIs, and gives your team full control over your data
and annotation infrastructure.
The platform serves as the foundation of
[CVAT Online](https://www.cvat.ai/pricing/cvat-online) and
[CVAT Enterprise](https://www.cvat.ai/enterprise), and is actively maintained by the CVAT engineering team.

Why teams choose CVAT Community:

- **Own your data:** Run entirely within your own infrastructure. No data leaves your environment.
- **AI-powered annotation:** Connect your own ML models for detection, segmentation, and tracking to speed up labeling.
- **Team collaboration:** Multi-user and multi-organization support with roles, task assignments,
  and review workflows.
- **MIT-licensed core:** Use, modify, and distribute CVAT Community under the permissive MIT License. Some serverless
assets and dependencies may have separate licenses.
- **Production-grade:** The foundation of all CVAT commercial products — battle-tested at scale.
- **True open-source:** Transparent development, active community, on GitHub since 2018.

This repository contains the source code and deployment assets for CVAT Community.

For a fully managed setup, annotation services, or enterprise features, see
[CVAT Online](https://www.cvat.ai/pricing/cvat-online),
[CVAT Enterprise](https://www.cvat.ai/enterprise) and
[CVAT Labeling Services](https://www.cvat.ai/annotation-services).

## Getting Started

> 💡 Want to explore CVAT before deploying anything?
> **[Try CVAT Online (Free plan)](https://app.cvat.ai)** directly in your browser.
> Feature availability and usage limits vary by plan; see
> [CVAT Online pricing](https://www.cvat.ai/pricing/cvat-online) for details.

### Installation

**Prerequisites:**

- [Docker Engine](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Git](https://git-scm.com/)

> 💡 CVAT is primarily tested with Chromium-based browsers (Google Chrome, Microsoft Edge).
> Firefox may work with some caveats; Safari/WebKit is not supported.

**1. Start the default stack**

Clone the repository and launch the services.

```bash
git clone https://github.com/cvat-ai/cvat
cd cvat

# Optional: set your IP or domain
# export CVAT_HOST=your-ip-or-domain

docker compose up -d
```

**2. Create an admin account**

```bash
docker exec -it cvat_server bash -ic 'python3 ~/manage.py createsuperuser'
```

See the [Installation Guide](https://docs.cvat.ai/docs/administration/community/basics/installation/) for full
instructions and OS-specific setup.

**3. Sign in and start labeling**

- Open [http://localhost:8080](http://localhost:8080) (or your `CVAT_HOST`) in your browser.
- Log in with your superuser account.
- Create a project or task, upload your data (images, videos, or point clouds), and define labels to start annotating.

Learn more about annotation tools and workflows in the [CVAT Documentation](https://docs.cvat.ai/docs/) or
take our free course – [CVAT Academy](https://www.cvat.ai/resources/academy).

_For alternative deployments (AWS, Kubernetes, external PostgreSQL, backups, upgrades), see the [Deployment Guides](https://docs.cvat.ai/docs/administration/community/advanced/)._

### Installing this fork's frame-buffering fix on an existing Docker deployment

The fork preserves normal CVAT task image quality by default, including during playback and at high
zoom. It fills look-ahead even while paused, using an approximately 20 GiB decoded-image
budget (at most 100 chunks), ten times the previous limits. This is client memory, not server memory;
large jobs require substantial available RAM and can cause memory pressure or browser termination
on smaller machines. The budget estimates decoded pixels, not total browser/GPU memory usage.
**Settings → Player → Look-ahead buffer multiplier** lets each browser choose an integer from 1 to 10
(default 10). Each step allows 2 GiB and 10 chunks; the optional preview budget scales by 64 MiB per
step. The setting is saved locally and applies when reopening the job or reloading the page, not to
an already open job's cache. Lower it on memory-constrained clients; image quality is unaffected.
Opening or seeking a 2D image job first fetches the selected full-quality
image, then buffers full-quality chunks without waiting for another navigation event. Existing chunks
are reused when available. These changes work for **existing tasks**; no re-upload, task conversion,
database migration, environment variable, or browser setting is required. Normal task quality means
the existing compressed representation, not recovery of detail discarded during task creation.
Source files, annotation coordinates, exports, and existing compressed/original API responses are unchanged.

**Settings → Player → Allow reduced-resolution playback** is an optional, persisted client setting,
disabled by default. Enabling it uses separately cached 512px JPEG previews for image playback, with
an additional 640 MiB decoded-preview budget (at most 100 chunks). This sacrifices resolution and JPEG quality, and is not
a perceptually lossless or zoom-adaptive mode. Paused previews refine to normal task quality after
250 ms without blanking the image; pixel-processing tools always use task quality. Starting playback
or leaving the frame cancels optional refinement still in flight. The UI falls back to normal chunks
if the server lacks preview support. Video and point-cloud representations are unchanged.
Video playback can prime one decoded chunk, waiting at most one second before its first buffered frame.
Canvas resize/annotation updates no longer mark an image ready while
it is still loading. Optional preview playback primes a small look-ahead window
(at most one extra second after the first preview arrives)
and pipelines bounded transfers to hide network round-trip latency.
Recreating an expired chunk result also clears the previous queue job's expiry, preventing a queued
replacement from disappearing and forcing a chunk timeout/retry.
Cold loads, preview generation, very slow links, and overloaded servers can still cause waits;
this is not a guarantee of zero buffering on every dataset or network.

**Back up the database and data volumes first.** Check the installed CVAT version before upgrading.
This checkout reports CVAT **2.74.1**. The fork's server and UI must be based on the same CVAT release
as the installation; matching just the image tag name is insufficient. If versions differ, follow
the normal CVAT upgrade procedure first, or backport these changes to the installed release.
Arbitrary cross-version compatibility is not guaranteed.

On the Docker host, check out this fork in a **separate directory** from your existing installation.
Build its server and UI images and copy the override to the existing installation directory:

```bash
# Run from this fork's checkout, not from the existing installation.
docker build -t cvat/server:buffering-fix .
docker build -f Dockerfile.ui -t cvat/ui:buffering-fix .
cp docker-compose.buffering.yml /path/to/existing/cvat/
```

From the existing installation directory, keep its `.env`, `CVAT_VERSION`, Compose project name,
host settings, and all existing Compose overrides. Append the buffering override **last**:

```bash
# Include any other -f files used by your existing deployment before the buffering override.
docker compose -f docker-compose.yml -f docker-compose.buffering.yml \
  up -d
```

The override replaces only CVAT application images (server, workers, and UI), not infrastructure images,
volumes, or configuration. Reload open browser tabs after the replacement. Do not run `down -v` or change
the Compose project name. Keep the override in future Compose commands to retain the fork's images.
For a same-release rollback, run the same `up` command with your original Compose files, omitting
`-f docker-compose.buffering.yml`; the original image tags have not been overwritten.

For a host without build tools or source access, build on a machine with the same CPU architecture,
transfer both images using `docker save` / `docker load`, and copy the override alongside the installation.
The images are local; no registry publication is required.

Run the deterministic buffering regressions with `yarn workspace cvat-core run test:frames`.

## Key Capabilities

- **[Manual & Auto-labeling](https://docs.cvat.ai/docs/annotation/manual-annotation/):** Annotate images, videos, and
  3D point clouds with bounding boxes, polygons, masks, keypoints, cuboids, tags, and more. Speed up labeling
  by connecting your own models for automatic annotation.
- **[Task Management](https://docs.cvat.ai/docs/workspace/):** Organize datasets into projects, split them into tasks
  and jobs, assign work to annotators, and track progress in real time.
- **[Collaboration](https://docs.cvat.ai/docs/account_management/user-roles/):** Create organizations, invite teammates,
  assign roles, and collaborate on annotations with comments and issues.
- **[Quality Control](https://docs.cvat.ai/docs/qa-analytics/manual-qa/):** Review annotations, flag issues, compare
  results across annotators with consensus, and run Ground Truth and Honeypot checks through the server API.
- **[Analytics](https://docs.cvat.ai/docs/administration/community/advanced/analytics/):** Monitor user activity,
  working time by job, events, and server logs with Grafana dashboards.
- **[Data Ops & Integrations](https://docs.cvat.ai/docs/dataset_management/export-datasets/):** Export/import in 20+
  formats (COCO, YOLO, Pascal VOC, KITTI, etc.), connect to cloud storage (S3, Azure, Google Cloud), and automate
  via REST API and Python SDK.

Advanced capabilities such as advanced project analytics, quality control UI, built-in auto-labeling with SAM 2
 and SAM 3, AI agents, SSO, and more are available in [CVAT Online](https://www.cvat.ai/pricing/cvat-online)
 paid plans (Solo, Team) and [CVAT Enterprise](https://www.cvat.ai/enterprise).

## Developer Tools

CVAT is designed for automation. Beyond the Web UI, you can integrate it into your pipelines using:

- [Python SDK](https://docs.cvat.ai/docs/api_sdk/sdk/): install with `pip install cvat-sdk` and automate task creation,
uploads, and exports from Python.
- [Command line tool](https://docs.cvat.ai/docs/api_sdk/cli/): install with `pip install cvat-cli`
and script common CVAT workflows from the terminal.
- [REST API](https://docs.cvat.ai/docs/api_sdk/api/): full programmatic control over CVAT.

## Data and Formats

CVAT Community supports image, video, and 3D (point cloud) annotation workflows. You can move data in and out using 20+
industry-standard formats: CVAT (XML), COCO (JSON), YOLO (TXT), Ultralytics YOLO (TXT/YAML), Pascal VOC (XML),
KITTI (TXT), MOT (TXT), and more.

[Full list of supported formats.](https://docs.cvat.ai/docs/dataset_management/formats/)

## ML and AI Models

CVAT Community supports automatic annotation via pre-built serverless models powered by Nuclio,
covering detection, segmentation, pose estimation, and tracking:

| Model | Framework | Type |
| --- | --- | --- |
| [Segment Anything (SAM)](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/facebookresearch/sam/nuclio) | PyTorch | Interactor |
| [Inside-Outside Guidance (IOG)](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/shiyinzhang/iog/nuclio) | PyTorch | Interactor |
| [RetinaNet R101](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/facebookresearch/detectron2/retinanet_r101/nuclio) | PyTorch | Detector |
| [HRNet32 Whole Body Pose](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/mmpose/hrnet32/nuclio) | PyTorch | Pose Estimation |
| [TransT](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/dschoerk/transt/nuclio) | PyTorch | Tracker |
| [YOLO v7](https://github.com/cvat-ai/cvat/tree/develop/serverless/onnx/WongKinYiu/yolov7/nuclio) | ONNX | Detector |
| [Mask RCNN Inception ResNet v2](https://github.com/cvat-ai/cvat/tree/develop/serverless/openvino/omz/public/mask_rcnn_inception_resnet_v2_atrous_coco/nuclio) | OpenVINO | Detector |
| [Face Detection 0205](https://github.com/cvat-ai/cvat/tree/develop/serverless/openvino/omz/intel/face-detection-0205/nuclio) | OpenVINO | Detector |
| [Faster RCNN Inception v2](https://github.com/cvat-ai/cvat/tree/develop/serverless/tensorflow/faster_rcnn_inception_v2_coco/nuclio) | TensorFlow | Detector |

To enable automatic annotation, add the serverless component to your deployment:

```bash
docker compose -f docker-compose.yml -f components/serverless/docker-compose.serverless.yml up -d
```

This starts the serverless infrastructure. To make models available in CVAT, install `nuctl` and deploy
the functions you need, for example SAM or YOLO, as described in the [Automatic Annotation Guide](https://docs.cvat.ai/docs/annotation/auto-annotation/automatic-annotation/).

## Which CVAT edition should I choose?

- **CVAT Online**: the fastest way to try CVAT and start labeling without deployment. Use it to evaluate CVAT in
the browser, explore managed features, and move to cost-efficient paid plans when you need more capacity or team
workflows.
- **CVAT Community**: the MIT-licensed self-hosted edition for teams that want to run CVAT themselves, customize the
stack, and control their infrastructure.
- **CVAT Enterprise**: for organizations that need CVAT in their own cloud or internal environment, enterprise support,
security controls such as SSO, paid platform features, and SLAs.
- **Labeling Services**: for teams that want to outsource annotation work to CVAT.ai’s experienced labeling team instead
of building an internal labeling operation. Customers get trial access to CVAT Online during the project.

For detailed plan limits and feature availability, see [CVAT Online pricing](https://www.cvat.ai/pricing/cvat-online),
 [CVAT Enterprise](https://www.cvat.ai/enterprise), and [Labeling Services](https://www.cvat.ai/annotation-services).

## Support

- **Usage questions:** ask the community on [Discord](https://discord.com/invite/fNR3eXfk6C) or
Stack Overflow with the `cvat` tag.
- **Bugs and feature requests:** use [GitHub Issues](https://github.com/cvat-ai/cvat/issues).
- **FAQ:** [Installation, upgrades, troubleshooting](https://docs.cvat.ai/docs/faq/).

For dedicated support, SLAs, or advanced deployments, consider [CVAT Enterprise](https://www.cvat.ai/enterprise).

## Contributing

We welcome all contributions: bug reports, documentation fixes, integrations, and code.

- If you'd like to contribute to CVAT, please refer to our
  [contribution documentation](https://docs.cvat.ai/docs/contributing/).
- For bug reports or feature requests, please use the [GitHub Issues](https://github.com/cvat-ai/cvat/issues) tracker.

## Security

- Please review our [Security Policy](https://github.com/cvat-ai/cvat/security/policy) before reporting vulnerabilities.
- For sensitive issues, contact: [secure@cvat.ai](mailto:secure@cvat.ai).

## License

CVAT Community is released under the MIT License.

- Code in `/serverless` is also MIT-licensed, but may use third-party assets under separate licenses (including
  non-commercial). Review those licenses before use.
- This software uses FFmpeg libraries under LGPL/GPL. See the Dockerfile and
  [FFmpeg legal info](https://www.ffmpeg.org/legal.html) for details.

## Additional Resources

For the latest product releases, feature walkthroughs, and all things CVAT see:

<table cellspacing="10" border="0"><tr>
  <td><a href="https://www.cvat.ai/resources/blog"><img src="site/content/en/images/badge-blog.png" alt="CVAT Blog" height="120"/></a></td>
  <td><a href="https://www.cvat.ai/resources/academy"><img src="site/content/en/images/badge-academy.png" alt="CVAT Academy" height="120"/></a></td>
  <td><a href="https://www.cvat.ai/resources/case-studies"><img src="site/content/en/images/badge-case-studies.png" alt="Case Studies" height="120"/></a></td>
  <td><a href="https://www.youtube.com/@cvat-ai"><img src="site/content/en/images/badge-youtube.png" alt="YouTube" height="120"/></a></td>
  <td><a href="https://www.linkedin.com/company/cvat-ai"><img src="site/content/en/images/badge-linkedin.png" alt="LinkedIn" height="120"/></a></td>
</tr></table>

  <!-- Badges -->

[ci-img]: https://github.com/cvat-ai/cvat/actions/workflows/main.yml/badge.svg?branch=develop
[ci-url]: https://github.com/cvat-ai/cvat/actions

[docs-img]: https://img.shields.io/badge/docs-docs.cvat.ai-blue?style=flat-square
[docs-url]: https://docs.cvat.ai

[online-img]: https://img.shields.io/badge/CVAT%20Online-app.cvat.ai-success?style=flat-square
[online-url]: https://app.cvat.ai

[release-img]: https://img.shields.io/github/v/release/cvat-ai/cvat?style=flat-square
[release-url]: https://github.com/cvat-ai/cvat/releases

[license-img]: https://img.shields.io/github/license/cvat-ai/cvat?style=flat-square
[license-url]: https://github.com/cvat-ai/cvat/blob/develop/LICENSE

[stars-img]: https://img.shields.io/github/stars/cvat-ai/cvat?style=flat-square
[stars-url]: https://github.com/cvat-ai/cvat/stargazers

[status-img]: https://uptime.betterstack.com/status-badges/v2/monitor/1yl3h.svg
[status-url]: https://status.cvat.ai

[enterprise-img]: https://img.shields.io/badge/CVAT%20Enterprise-cvat.ai-orange?style=flat-square
[enterprise-url]: https://www.cvat.ai/enterprise

[docker-server-pulls-img]: https://img.shields.io/docker/pulls/cvat/server.svg?style=flat-square&label=server%20pulls
[docker-server-image-url]: https://hub.docker.com/r/cvat/server

[docker-ui-pulls-img]: https://img.shields.io/docker/pulls/cvat/ui.svg?style=flat-square&label=UI%20pulls
[docker-ui-image-url]: https://hub.docker.com/r/cvat/ui

[discord-img]: https://img.shields.io/discord/1000789942802337834?label=discord
[discord-url]: https://discord.gg/fNR3eXfk6C
