/**
 * PDF 文本层的排版计算。
 *
 * 我们不用 pdfjs-dist 自带的 `TextLayer`：它在 Electron 里会长时间不返回
 * （render() 挂住，容器永远是空的），而它只是把文本绘制成「透明、可选中」的定位 span。
 * 这里的纯函数只做数学：把 PDF 的文本项换算成相对页面左上角的 CSS 位置。
 *
 * 坐标系与 pdf.js 保持一致：传入 viewport.transform（页 → 视口矩阵）与视口缩放。
 */

/** PDF 文本项里我们需要的字段（避免依赖 pdfjs 的运行时类型）。 */
export interface PdfTextItemLike {
  str: string
  width: number
  transform: number[]
}

export interface TextSpanLayout {
  text: string
  /** 相对页面左上角的定位（CSS px）。 */
  left: number
  top: number
  fontSize: number
  /** 文字倾斜角（弧度），绝大多数 PDF 是 0。 */
  angle: number
  /** 该段文字在视口里的目标宽度（CSS px），用于横向拉伸对齐。 */
  width: number
}

/** 矩阵相乘，语义与 pdf.js 的 `Util.transform` 完全一致。 */
export function multiplyTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

/**
 * 把文本项换算成 span 布局。空字符串、纯空白、以及换算后为零宽度的项直接丢弃
 * （它们只会在文本层里留下看不见的空 span，反而挡住鼠标）。
 */
export function layoutTextSpans(
  items: readonly PdfTextItemLike[],
  viewportTransform: readonly number[],
  viewportScale: number,
): TextSpanLayout[] {
  const layouts: TextSpanLayout[] = []
  for (const item of items) {
    if (!item.str || item.str.trim().length === 0) continue
    const tx = multiplyTransform([...viewportTransform], [...item.transform])
    const fontSize = Math.hypot(tx[2], tx[3])
    if (!Number.isFinite(fontSize) || fontSize <= 0) continue
    const width = item.width * viewportScale
    layouts.push({
      text: item.str,
      left: tx[4],
      top: tx[5] - fontSize,
      fontSize,
      angle: Math.atan2(tx[1], tx[0]),
      width: Number.isFinite(width) && width > 0 ? width : 0,
    })
  }
  return layouts
}

/** 横向缩放系数：把自然宽度的 span 拉伸到 PDF 给出的目标宽度。 */
export function horizontalScale(naturalWidth: number, targetWidth: number): number {
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) return 1
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) return 1
  const scale = targetWidth / naturalWidth
  // 极端值说明测量失败（字体还没就绪等），宁可不动也别把文字拉成一条线
  return scale > 0.2 && scale < 5 ? scale : 1
}
