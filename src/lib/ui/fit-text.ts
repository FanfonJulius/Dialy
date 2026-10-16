import type { Attachment } from 'svelte/attachments';

const MIN_FONT_PX = 11;
const STEP_PX = 0.5;

type Sizes = { fontPx: number; textPx: number; boxPx: number; minPx: number };

/** The font size at which text measuring `textPx` at `fontPx` fits `boxPx`, or null when it already fits. */
export function fittedFontSize({ fontPx, textPx, boxPx, minPx }: Sizes): number | null {
	if (textPx <= boxPx || boxPx <= 0) return null;
	return Math.max(minPx, Math.floor((fontPx * boxPx * 10) / textPx) / 10);
}

/**
 * Shrinks the element's font until `text` fits on one line; text still too wide at `minPx` wraps instead.
 * Takes the text so the fit is redone when it changes.
 */
export function fitText(text: string, minPx = MIN_FONT_PX): Attachment<HTMLElement> {
	return (node) => {
		if (!text) return;
		const overflows = () => node.scrollWidth > node.clientWidth;

		function fit(): void {
			Object.assign(node.style, { fontSize: '', whiteSpace: 'nowrap', overflowWrap: 'normal' });
			const fontPx = parseFloat(getComputedStyle(node).fontSize);
			let size = fittedFontSize({ fontPx, textPx: node.scrollWidth, boxPx: node.clientWidth, minPx });
			while (size !== null) {
				node.style.fontSize = `${size}px`;
				// Text width is not exactly proportional to the font size.
				if (!overflows() || size === minPx) break;
				size = Math.max(minPx, size - STEP_PX);
			}
			if (overflows()) Object.assign(node.style, { whiteSpace: 'normal', overflowWrap: 'anywhere' });
		}

		let frame = 0;
		const refit = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(fit);
		};
		fit();
		window.addEventListener('resize', refit);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', refit);
		};
	};
}
