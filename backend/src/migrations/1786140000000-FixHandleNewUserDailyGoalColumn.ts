import { MigrationInterface, QueryRunner } from 'typeorm';

// #291 (live bug, found while testing Google sign-in) — 1786120000000
// (RenameProfilesDailyGoalMinToPoints) renamed profiles.daily_goal_min to
// daily_goal_points, but never updated handle_new_user() to match. Every
// signup since that migration ran — Google OR email/password — has been
// hitting `INSERT INTO public.profiles (..., daily_goal_min) VALUES (...)`
// against a column that no longer exists, which Postgres rejects and
// Supabase Auth surfaces to the client as a generic 500
// "Database error saving new user" (unexpected_failure). This is why the
// Google OAuth flow got all the way through Google's consent screen and
// back to Supabase's callback before failing — auth itself was fine; only
// the post-auth profile-row creation was broken.
//
// Fix is just re-pointing the INSERT at the current column name. No data
// to backfill — this was a pure column-name mismatch, not a values issue.
export class FixHandleNewUserDailyGoalColumn1786140000000 implements MigrationInterface {
  name = 'FixHandleNewUserDailyGoalColumn1786140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        INSERT INTO public.profiles (
          id,
          name,
          role,
          goal,
          streak,
          daily_goal_points
        )
        VALUES (
          NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'name', ''),
          NEW.raw_user_meta_data->>'role',
          NULL,
          0,
          300
        );

        RETURN NEW;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restores the pre-fix (broken) definition for symmetry with up() —
    // matches the convention elsewhere in this migration set of down()
    // recreating the exact prior function body, not a "better" one.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        INSERT INTO public.profiles (
          id,
          name,
          role,
          goal,
          streak,
          daily_goal_min
        )
        VALUES (
          NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'name', ''),
          NEW.raw_user_meta_data->>'role',
          NULL,
          0,
          30
        );

        RETURN NEW;
      END;
      $$;
    `);
  }
}
