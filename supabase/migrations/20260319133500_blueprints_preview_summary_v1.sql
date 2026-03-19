alter table public.blueprints
  add column if not exists preview_summary text;

with preview_source as (
  select
    id,
    nullif(
      trim(
        regexp_replace(
          regexp_replace(
            coalesce(
              nullif(trim(sections_json -> 'summary' ->> 'text'), ''),
              nullif(
                trim((
                  select bullet
                  from jsonb_array_elements_text(coalesce(sections_json -> 'takeaways' -> 'bullets', '[]'::jsonb)) as bullet
                  limit 1
                )),
                ''
              ),
              nullif(trim(sections_json -> 'storyline' ->> 'text'), ''),
              nullif(trim(llm_review), ''),
              nullif(trim(mix_notes), ''),
              nullif(trim(title), '')
            ),
            '\s+',
            ' ',
            'g'
          ),
          '^summary(?:\s*[.:\-–—]\s*|\s+)',
          '',
          'i'
        )
      ),
      ''
    ) as value
  from public.blueprints
)
update public.blueprints as blueprints
set preview_summary = case
  when char_length(preview_source.value) > 220 then left(preview_source.value, 217) || '...'
  else preview_source.value
end
from preview_source
where blueprints.id = preview_source.id
  and coalesce(blueprints.preview_summary, '') is distinct from coalesce(
    case
      when char_length(preview_source.value) > 220 then left(preview_source.value, 217) || '...'
      else preview_source.value
    end,
    ''
  );
