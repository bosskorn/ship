"""Unit tests for the Receipt Enhance tone policy. Run: python3 -m unittest test_enhance_policy -v"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enhance_policy as P  # noqa: E402


def rect(w, h, x=100, y=100):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


class TonePolicy(unittest.TestCase):
    def test_normal_receipt_is_crisp(self):
        d = P.choose_tone(rect(840, 1800))  # 10.5 px/mm, aspect 2.14
        self.assertEqual((d['tone'], d['reason']), ('crisp', 'normal'))

    def test_long_receipt_is_natural(self):
        d = P.choose_tone(rect(900, 4500))  # aspect 5, good resolution
        self.assertEqual((d['tone'], d['reason']), ('natural', 'long_aspect'))

    def test_aspect_boundaries(self):
        self.assertEqual(P.choose_tone(rect(1000, 3000))['reason'], 'long_aspect')     # exactly 3.0
        self.assertEqual(P.choose_tone(rect(1000, 2999))['reason'], 'unsure_aspect')
        self.assertEqual(P.choose_tone(rect(1000, 2600))['reason'], 'unsure_aspect')   # exactly 2.6
        self.assertEqual(P.choose_tone(rect(1000, 2599))['reason'], 'normal')

    def test_low_resolution_is_natural(self):
        d = P.choose_tone(rect(556, 1100))  # 6.95 px/mm, like the synthetic long receipts
        self.assertEqual((d['tone'], d['reason']), ('natural', 'low_resolution'))
        self.assertEqual(P.choose_tone(rect(720, 1400))['reason'], 'unsure_resolution')  # 9.0 px/mm
        self.assertEqual(P.choose_tone(rect(760, 1400))['reason'], 'normal')             # 9.5 px/mm

    def test_sideways_receipt_measured_the_same(self):
        self.assertEqual(P.choose_tone(rect(4500, 900))['reason'], 'long_aspect')
        self.assertEqual(P.choose_tone(rect(1800, 840))['tone'], 'crisp')

    def test_rotated_quad(self):
        c, s = np.cos(0.3), np.sin(0.3)
        q = np.float32(rect(840, 1800, 0, 0)) @ np.float32([[c, s], [-s, c]]) + 2000
        self.assertEqual(P.choose_tone(q)['tone'], 'crisp')

    def test_unusable_quads_fall_back_to_natural(self):
        for q in (None, [[0, 0], [1, 1]], [[0, 0], [10, 0], [10, 10], [0, 10]],
                  [[0, 0], [np.nan, 0], [10, 10], [0, 10]], [[0, 0], [800, 0], [0, 1800], [800, 1800]][:3]):
            d = P.choose_tone(q)
            self.assertEqual((d['tone'], d['reason']), ('natural', 'no_usable_quad'), q)

    def test_deterministic(self):
        q = rect(840, 1800)
        self.assertEqual(P.choose_tone(q), P.choose_tone(list(map(list, q))))

    def test_enhance_does_not_modify_original(self):
        rng = np.random.default_rng(0)
        cap = rng.integers(0, 255, (2400, 1800, 3), dtype=np.uint8)
        before = cap.copy()
        rect_img, out, d = P.enhance(cap, rect(840, 1800))
        self.assertTrue(np.array_equal(cap, before))
        self.assertEqual(d['tone'], 'crisp')
        self.assertEqual(rect_img.shape, out.shape)
        self.assertFalse(np.shares_memory(out, cap))

    def test_enhance_without_quad_uses_whole_frame_natural(self):
        cap = np.full((1200, 900, 3), 200, np.uint8)
        _, out, d = P.enhance(cap, None)
        self.assertEqual(d['tone'], 'natural')
        self.assertEqual(out.shape[1], 1152)


if __name__ == '__main__':
    unittest.main()
