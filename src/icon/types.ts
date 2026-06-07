// icon/types.ts — Icon pipeline type definitions

/**
 * Resolved icon configuration used internally by the pipeline.
 * Normalized from the user's string or IconConfig input.
 */
export interface ResolvedIconConfig {
  /** Absolute path to source icon file */
  srcPath: string
  /** Background color for adaptive icon (hex, e.g. "#000000") */
  background: string
  /** Whether to generate adaptive icon wrappers */
  adaptive: boolean
}

/**
 * Mipmap density bucket definition.
 * Android uses density-qualified resource folders to serve
 * the right icon size for each screen density.
 */
export interface MipmapBucket {
  /** Density qualifier name (e.g. "mdpi", "hdpi") */
  name: string
  /** Target icon size in pixels */
  size: number
}

/**
 * Standard Android mipmap density buckets.
 *
 * mdpi    = 48×48   (baseline, 1× density)
 * hdpi    = 72×72   (1.5×)
 * xhdpi   = 96×96   (2×)
 * xxhdpi  = 144×144 (3×)
 * xxxhdpi = 192×192 (4×)
 */
export const MIPMAP_BUCKETS: MipmapBucket[] = [
  { name: 'mdpi',    size: 48  },
  { name: 'hdpi',    size: 72  },
  { name: 'xhdpi',   size: 96  },
  { name: 'xxhdpi',  size: 144 },
  { name: 'xxxhdpi', size: 192 },
]

/**
 * Adaptive icon safe zone ratio.
 *
 * Android clips adaptive icons to a shape (circle, squircle, etc).
 * The "safe zone" is the inner 66% circle where content is guaranteed visible.
 * We use 72% as our content area (slightly generous) to avoid the icon
 * looking too small while staying inside the safe zone.
 */
export const ADAPTIVE_SAFE_ZONE_RATIO = 0.72

/**
 * Legacy icon padding ratio (for pre-API 26 launchers).
 * Gives a 10% padding on each side.
 */
export const LEGACY_PADDING_RATIO = 0.80
