import { describe, expect, it } from 'vitest';

import { aspectRatioOf, captionLine, IMAGE_RATIOS, imagePresentation } from './Image.logic';

describe('aspectRatioOf', () => {
  it('turns each ratio into width / height', () => {
    expect(aspectRatioOf('4:5')).toBeCloseTo(0.8);
    expect(aspectRatioOf('1:1')).toBe(1);
    expect(aspectRatioOf('16:9')).toBeCloseTo(16 / 9);
    expect(aspectRatioOf('3:4')).toBeCloseTo(0.75);
  });

  it('defaults to the 4:5 feed ratio', () => {
    expect(aspectRatioOf()).toBeCloseTo(0.8);
    expect(IMAGE_RATIOS[0]).toBe('4:5');
  });
});

describe('imagePresentation', () => {
  it('shows only the photo over the ground while loading and once loaded', () => {
    for (const status of ['loading', 'loaded'] as const) {
      expect(imagePresentation('file://a.jpg', status)).toEqual({
        photo: true,
        placeholder: false,
        altInWords: false,
      });
    }
  });

  it('shows the O and the alt in words when the photo fails', () => {
    expect(imagePresentation('file://a.jpg', 'error')).toEqual({
      photo: false,
      placeholder: true,
      altInWords: true,
    });
  });

  it('treats a missing or empty src as failed, never a broken image', () => {
    expect(imagePresentation(undefined, 'loading').placeholder).toBe(true);
    expect(imagePresentation('', 'loading')).toMatchObject({ photo: false, altInWords: true });
  });

  it("doesn't repeat the alt on screen under an overlay", () => {
    expect(imagePresentation(undefined, 'loading', true)).toEqual({
      photo: false,
      placeholder: true,
      altInWords: false,
    });
  });
});

describe('captionLine', () => {
  it('joins caption and credit with a middle dot', () => {
    expect(captionLine('Floodlit court, Thursday', 'Photo: Ada')).toBe(
      'Floodlit court, Thursday · Photo: Ada',
    );
  });

  it('shows either one alone without a stray dot', () => {
    expect(captionLine('Rain on the canal')).toBe('Rain on the canal');
    expect(captionLine(undefined, 'Photo: Ada')).toBe('Photo: Ada');
    expect(captionLine('  ', 'Photo: Ada')).toBe('Photo: Ada');
  });

  it('is null with neither', () => {
    expect(captionLine()).toBeNull();
    expect(captionLine('', '')).toBeNull();
  });
});
