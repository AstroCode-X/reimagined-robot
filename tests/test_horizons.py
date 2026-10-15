import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('fetch_horizons', ROOT / 'tools' / 'fetch_horizons.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class HorizonsTests(unittest.TestCase):
    def test_csv_parser_two_flags_and_angles(self):
        fixture = '''Sample response\n$$SOE
 2026-Nov-14 00:00,*,i, 124.009800, 2.345100,
 2026-Nov-14 01:00, ,i, 129.009800, -2.345100,
 2026-Nov-14 02:00, , , 135.000000, 0.000000,
$$EOE'''
        rows = h.parse_horizons_text(fixture)
        self.assertEqual(3, len(rows))
        self.assertEqual('2026-11-14T00:00:00Z', rows[0]['time'])
        self.assertEqual(124.0098, rows[0]['az'])
        self.assertEqual(-2.3451, rows[1]['el'])

    def test_reject_bad_az(self):
        bad = '$$SOE\n2026-Nov-14 00:00,*, ,400.0,0.0,\n2026-Nov-14 01:00, , ,200.0,0.0\n$$EOE'
        with self.assertRaises(ValueError):
            h.parse_horizons_text(bad)

    def test_reject_missing_delimiters(self):
        with self.assertRaises(ValueError):
            h.parse_horizons_text('Error: unrecognized site')

    def test_reject_unsorted(self):
        bad = '$$SOE\n2026-Nov-14 01:00,0.0,0.0\n2026-Nov-14 00:00,0.0,0.0\n$$EOE'
        with self.assertRaises(ValueError):
            h.parse_horizons_text(bad)


if __name__ == '__main__':
    unittest.main()
