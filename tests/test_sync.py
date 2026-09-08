import sys
from pathlib import Path
import numpy as np
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
from sync import subtitle_signal, solve, supported_pieces

@pytest.fixture(scope='module')
def reference():
    random=np.random.default_rng(4)
    cues=[]
    time=5.
    while time<590:
        duration=float(random.uniform(.4,3.7))
        cues.append(dict(start=time*1000,end=(time+duration)*1000))
        time+=duration+float(random.uniform(.3,6.))
    signal=subtitle_signal(cues,60000)
    windows=[(float(s),float(s+45)) for s in np.linspace(0,555,8)]
    masked=np.full(len(signal),.5)
    for start,end in windows: masked[int(start*100):int(end*100)]=signal[int(start*100):int(end*100)]
    return cues,masked,windows

@pytest.mark.parametrize('scale,offset',[(1,2.4),(1,-3.2),(1.2,0),(25/30,1.7),(25/24,-2)])
def test_recovers_translation_independent_offset_and_rate(reference,scale,offset):
    original,ref,windows=reference
    supplied=[dict(start=(c['start']-offset*1000)/scale,end=(c['end']-offset*1000)/scale) for c in original]
    result=solve(supplied,ref,windows,600)
    assert result['accepted'],result
    actual=result['transform']
    errors=[abs(c['start']*actual['scale']+actual['offset']*1000-o['start']) for c,o in zip(supplied,original)]
    assert np.percentile(errors,95)<150

def test_silence_is_not_a_success(reference):
    cues,ref,windows=reference
    result=solve(cues,np.zeros(len(ref)),windows,600)
    assert not result['accepted']

def test_discontinuity_is_not_claimed_as_one_global_fix(reference):
    original,ref,windows=reference
    changed=[dict(start=c['start']+(4000 if c['start']>300000 else 0),end=c['end']+(4000 if c['start']>300000 else 0)) for c in original]
    assert not solve(changed,ref,windows,600)['accepted']

def test_supported_piecewise_regions_recover_both_sides_of_a_cut(reference):
    original,_,_=reference
    ref=subtitle_signal(original,60000)
    windows=[(float(s),float(s+75)) for s in np.linspace(0,525,12)]
    changed=[dict(start=c['start']+(4000 if c['start']>300000 else 0),end=c['end']+(4000 if c['start']>300000 else 0)) for c in original]
    evidence=solve(changed,ref,windows,600)
    pieces=supported_pieces(evidence['checks'],600)
    assert pieces
    corrected=[]
    for c,o in zip(changed,original):
        start=c['start']/1000*evidence['transform']['scale']+evidence['transform']['offset']
        end=c['end']/1000*evidence['transform']['scale']+evidence['transform']['offset']
        piece=next((p for p in pieces if start>=p['start'] and end<=p['end']),None)
        if piece: corrected.append(abs((start+piece['offset'])*1000-o['start']))
    assert len(corrected)>len(original)*.6
    assert np.percentile(corrected,95)<400
