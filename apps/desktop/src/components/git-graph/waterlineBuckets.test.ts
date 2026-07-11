import { describe, it, expect, vi } from 'vitest'
import { getWaterlineBucket, bucketLabel } from './waterlineBuckets'

const NOW = 1_700_000_000 // arbitrary fixed epoch seconds
const DAY = 86400

describe('getWaterlineBucket', () => {
  it('buckets a commit from right now as "today"', () => {
    expect(getWaterlineBucket(NOW, NOW).key).toBe('today')
  })

  it('buckets a commit in the future (negative age) as "today" rather than throwing', () => {
    expect(getWaterlineBucket(NOW + 10_000, NOW).key).toBe('today')
  })

  it('buckets a commit just under 1 day old as "today"', () => {
    expect(getWaterlineBucket(NOW - (DAY - 1), NOW).key).toBe('today')
  })

  it('buckets a commit exactly 1 day old as "yesterday" (boundary is exclusive)', () => {
    expect(getWaterlineBucket(NOW - DAY, NOW).key).toBe('yesterday')
  })

  it('buckets a commit just under 2 days old as "yesterday"', () => {
    expect(getWaterlineBucket(NOW - (2 * DAY - 1), NOW).key).toBe('yesterday')
  })

  it('buckets a commit exactly 2 days old as "thisWeek"', () => {
    expect(getWaterlineBucket(NOW - 2 * DAY, NOW).key).toBe('thisWeek')
  })

  it('buckets a commit exactly 7 days old as "lastWeek"', () => {
    expect(getWaterlineBucket(NOW - 7 * DAY, NOW).key).toBe('lastWeek')
  })

  it('buckets a commit exactly 14 days old as "thisMonth"', () => {
    expect(getWaterlineBucket(NOW - 14 * DAY, NOW).key).toBe('thisMonth')
  })

  it('buckets a commit exactly 30 days old as "lastMonth"', () => {
    expect(getWaterlineBucket(NOW - 30 * DAY, NOW).key).toBe('lastMonth')
  })

  it('buckets a commit exactly 60 days old as "thisYear"', () => {
    expect(getWaterlineBucket(NOW - 60 * DAY, NOW).key).toBe('thisYear')
  })

  it('buckets a commit exactly 365 days old as "older"', () => {
    expect(getWaterlineBucket(NOW - 365 * DAY, NOW).key).toBe('older')
  })

  it('buckets a very old commit as "older"', () => {
    expect(getWaterlineBucket(0, NOW).key).toBe('older')
  })

  it('assigns strictly increasing ranks from today to older, in bucket order', () => {
    const timestamps = [NOW, NOW - DAY, NOW - 2 * DAY, NOW - 7 * DAY, NOW - 14 * DAY, NOW - 30 * DAY, NOW - 60 * DAY, NOW - 365 * DAY]
    const ranks = timestamps.map((ts) => getWaterlineBucket(ts, NOW).rank)
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('builds labelKey from the bucket key under the gitTree.waterline namespace', () => {
    expect(getWaterlineBucket(NOW, NOW).labelKey).toBe('gitTree.waterline.today')
  })

  it('defaults `now` to the current time when omitted', () => {
    const nowSeconds = Date.now() / 1000
    expect(getWaterlineBucket(nowSeconds).key).toBe('today')
  })
})

describe('bucketLabel', () => {
  it('translates the bucket via its labelKey', () => {
    const t = vi.fn((key: string) => `translated:${key}`)
    const bucket = getWaterlineBucket(NOW, NOW)
    expect(bucketLabel(bucket, t)).toBe('translated:gitTree.waterline.today')
    expect(t).toHaveBeenCalledWith('gitTree.waterline.today')
  })
})
