import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from evidence_previews import previews
from evidence_tool import InvalidEvidence


class PreviewTests(unittest.TestCase):
    def test_preview_is_bound_to_checked_original_and_decoder_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'recording.webm'; source.write_bytes(b'video sample')
            artifact={'path':'recording.webm','mediaType':'video/webm','bytes':len(b'video sample'),'sha256':hashlib.sha256(b'video sample').hexdigest()}
            manifest={'repository':'justafolk/sample-project-exhibit','pullRequest':2,'headSha':'a'*40,
                      'runId':'sample-pr-123','attempt':1,'artifacts':[artifact]}
            def decoder(args,**kwargs):
                self.assertIn('file,pipe',args)
                self.assertIn('20',args)
                self.assertEqual(kwargs['timeout'],60)
                self.assertNotIn('shell',kwargs)
                Path(args[-1]).write_bytes(b'GIF89a animated sample')
            with patch('evidence_previews.subprocess.run',side_effect=decoder):
                index,images=previews(manifest,root)
            self.assertEqual(index['previews'][0]['video'],artifact)
            self.assertEqual(images[0]['mediaType'],'image/gif')
            self.assertEqual(index['headSha'],'a'*40)
            source.write_bytes(b'changed')
            with patch('evidence_previews.subprocess.run') as decoder:
                with self.assertRaises(InvalidEvidence):previews(manifest,root)
                decoder.assert_not_called()
