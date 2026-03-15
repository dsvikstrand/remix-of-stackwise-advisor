delete from public.provider_circuit_state
where provider_key = 'transcript:yt_to_text';

delete from public.youtube_transcript_cache
where coalesce(provider_id, '') = 'yt_to_text'
   or coalesce(transcript_source, '') like 'yt_to_text%'
   or coalesce(transport_json->>'provider', '') = 'yt_to_text'
   or coalesce(provider_trace_json->>'winning_provider', '') = 'yt_to_text'
   or coalesce(provider_trace_json->>'cache_provider', '') = 'yt_to_text'
   or coalesce(provider_trace_json::text, '') like '%"yt_to_text"%';
