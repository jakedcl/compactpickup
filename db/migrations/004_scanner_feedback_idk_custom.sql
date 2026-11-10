-- Extend public scanner feedback for uncertain verdicts and free-text corrections.

alter table scanner_feedback
  drop constraint if exists scanner_feedback_shape;

alter table scanner_feedback
  drop constraint if exists scanner_feedback_verdict_check;

alter table scanner_feedback
  add column if not exists corrected_truck_custom_text text;

alter table scanner_feedback
  add constraint scanner_feedback_verdict_check
  check (verdict in ('right', 'wrong', 'idk'));

alter table scanner_feedback
  add constraint scanner_feedback_shape check (
    (
      verdict = 'right'
      and guessed_truck_id is not null
      and guessed_truck_slug is not null
      and corrected_truck_id is null
      and corrected_truck_slug is null
      and corrected_truck_custom_text is null
    )
    or (
      verdict = 'idk'
      and guessed_truck_id is not null
      and guessed_truck_slug is not null
      and corrected_truck_id is null
      and corrected_truck_slug is null
      and corrected_truck_custom_text is null
    )
    or (
      verdict = 'wrong'
      and guessed_truck_id is not null
      and guessed_truck_slug is not null
      and (
        (
          corrected_truck_id is not null
          and corrected_truck_slug is not null
          and corrected_truck_custom_text is null
        )
        or (
          corrected_truck_id is null
          and corrected_truck_slug is null
          and corrected_truck_custom_text is not null
          and length(trim(corrected_truck_custom_text)) > 0
        )
      )
    )
  );
