"""Create bounded animated previews in the secret-free test job, never the publisher."""
import hashlib
from pathlib import Path
import subprocess

from evidence_tool import require, verify_artifacts


def previews(manifest, root):
    root = Path(root)
    verify_artifacts(manifest, root)
    directory = root / 'previews'
    require(not directory.is_symlink(), 'preview directory cannot be a symlink')
    directory.mkdir(exist_ok=True)
    entries, artifacts = [], []
    videos = [a for a in manifest['artifacts'] if a['mediaType'] in ('video/webm','video/mp4')]
    for index, video in enumerate(videos[:4], 1):
        path = directory / f'recording-{index:02}.gif'
        require(not path.is_symlink(), 'preview cannot be a symlink')
        subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-threads','1','-protocol_whitelist','file,pipe','-i',str(root/video['path']),
                        '-t','20','-map','0:v:0','-an','-filter_complex_threads','1','-vf',
                        'fps=6,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer',
                        '-loop','0',str(path)], check=True, capture_output=True, timeout=60)
        data = path.read_bytes()
        require(data[:6] in (b'GIF87a',b'GIF89a') and 0 < len(data) <= 5*1024*1024,
                'invalid or oversized animated preview')
        artifact = {'path':path.relative_to(root).as_posix(),'sha256':hashlib.sha256(data).hexdigest(),
                    'bytes':len(data),'mediaType':'image/gif'}
        artifacts.append(artifact)
        entries.append({'preview':artifact, 'video':video.copy(), 'maxSeconds':20})
    return {'schemaVersion':1,'repository':manifest['repository'],'pullRequest':manifest['pullRequest'],
            'headSha':manifest['headSha'],'runId':manifest['runId'],'attempt':manifest['attempt'],
            'previews':entries}, artifacts
