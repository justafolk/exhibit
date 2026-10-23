import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import worktree

class WorktreeTests(unittest.TestCase):
    def test_identity_and_port_ranges(self):
        self.assertEqual(worktree.ports_for('/tmp/a'), worktree.ports_for('/tmp/a'))
        self.assertNotEqual(worktree.identity('/tmp/a'), worktree.identity('/tmp/b'))
        ports = worktree.ports_for('/tmp/a')
        self.assertTrue(20000 <= ports[0] < 30000)
        self.assertTrue(30000 <= ports[1] < 40000)
        self.assertTrue(40000 <= ports[2] < 50000)

    def test_env_is_idempotent_and_avoids_busy_ports(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch('worktree.available', side_effect=[False, True]):
                worktree.env(root)
            original = (root / '.env').read_text()
            self.assertNotIn(f'WEB_PORT={worktree.ports_for(root)[0]}\n', original)
            (root / '.env').write_text(original + '# user setting\n')
            worktree.env(root)
            self.assertTrue((root / '.env').read_text().endswith('# user setting\n'))
            self.assertEqual((root / '.env').stat().st_mode & 0o777, 0o600)

    def test_invalid_branch_names_are_rejected_before_git(self):
        for name in ['../escape', 'hello world', '', 'UPPER', '-danger']:
            with self.assertRaises(ValueError):
                worktree.create(name)
