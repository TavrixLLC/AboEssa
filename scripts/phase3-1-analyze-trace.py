"""Analyze official Perfetto traces; install perfetto only in the QA tool directory."""
import json
import sys
from perfetto.trace_processor import TraceProcessor

source, target = sys.argv[1:3]
pid = int(sys.argv[3]) if len(sys.argv) > 3 else 7226
queries = {
    'frame_schema': 'pragma table_info(actual_frame_timeline_slice)',
    'processes': "select upid,pid,name from process where name like '%phase3qa%'",
    'threads': "select tid,thread.name,count(*) slices,round(sum(s.dur)/1e6,1) totalMs from slice s join thread_track tt on tt.id=s.track_id join thread using(utid) join process using(upid) where process.name like '%phase3qa%' group by tid order by totalMs desc",
    'slices': "select s.name,count(*) n,round(sum(s.dur)/1e6,2) totalMs,round(max(s.dur)/1e6,2) maxMs from slice s join thread_track tt on tt.id=s.track_id join thread using(utid) join process using(upid) where process.name like '%phase3qa%' and s.dur>0 group by s.name order by totalMs desc limit 100",
    'stages': "select name,ts,dur from slice where name glob '*phase3/*'",
    'presentation': "select p.name,a.layer_name,a.jank_type,a.present_type,count(*) n,round(avg(a.dur)/1e6,2) avgMs,round(max(a.dur)/1e6,2) maxMs from actual_frame_timeline_slice a join process p using(upid) where p.name like '%phase3qa%' group by p.name,a.layer_name,a.jank_type,a.present_type",
    'stats': "select name,value from stats where severity='error' and value>0",
    'stage_costs': "select st.name stage,s.name,count(*) n,round(avg(s.dur)/1e6,3) meanMs,round(max(s.dur)/1e6,3) maxMs from slice st join slice s on s.ts>=st.ts and s.ts+s.dur<=st.ts+st.dur join thread_track tt on tt.id=s.track_id join thread using(utid) join process using(upid) where st.name glob 'phase3/*' and process.name like '%phase3qa%' and s.name in ('BUILD','LAYOUT','PAINT','GPURasterizer::Draw','SurfaceFrame::Submit','SurfaceFrame::Encode','eglSwapBuffers','AppCatalogImage','AppOptimizedImage','RenderSliverGrid','RenderRepaintBoundary','CustomScrollView','ConcurrentMark','CollectNewGeneration') group by st.name,s.name",
    'graphics_details': "select s.name,count(*) n,round(sum(s.dur)/1e6,2) inclusiveMs,round(max(s.dur)/1e6,2) maxMs from slice s join thread_track tt on tt.id=s.track_id join thread using(utid) join process using(upid) where process.name like '%phase3qa%' and (s.name glob '*Shader*' or s.name glob '*Pipeline*' or s.name glob '*Subpass*' or s.name glob '*Offscreen*' or s.name glob '*Decode*' or s.name glob '*Image*' or s.name glob '*Layer*' or s.name glob '*Collect*') group by s.name order by inclusiveMs desc limit 75",
}
result = {}
with TraceProcessor(trace=source) as tp:
    for label, query in queries.items():
        try:
            query = query.replace("process.name like '%phase3qa%'", f"process.pid={pid}").replace("p.name like '%phase3qa%'", f"p.pid={pid}").replace("name like '%phase3qa%'", f"pid={pid}")
            result[label] = [vars(row) for row in tp.query(query)]
        except Exception as exc:
            result[label] = {'error': str(exc)}
with open(target, 'w', encoding='utf8') as stream:
    json.dump(result, stream, indent=2, ensure_ascii=False)
print(json.dumps(result, ensure_ascii=False))
