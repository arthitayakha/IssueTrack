import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "Forgot password" — the one-time link store. Only the SHA-256 of the token
 * is kept: the raw value travels in the e-mail link (`?token=…`), so a leaked
 * database row cannot be replayed. `expires_at` (30 minutes) and `used_at`
 * enforce single use; a new request clears the user's older rows in code.
 *
 * Idempotent on purpose — `IF NOT EXISTS` everywhere.
 */
export class AddPasswordResetTokens1812000000000 implements MigrationInterface {
    name = "AddPasswordResetTokens1812000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash  VARCHAR(64) NOT NULL UNIQUE,
                expires_at  TIMESTAMPTZ NOT NULL,
                used_at     TIMESTAMPTZ NULL,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
             ON password_reset_tokens (user_id)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_password_reset_tokens_user`);
        await queryRunner.query(`DROP TABLE IF EXISTS password_reset_tokens`);
    }
}
