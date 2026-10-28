import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `attachments.file_type` was created as `character(100)` (fixed-length), so
 * every stored MIME type came back space-padded ("application/pdf" + 85
 * spaces). The preview dialog compares `fileType === "application/pdf"`
 * exactly, so PDFs always fell through to "preview not supported" while
 * images still worked (startsWith ignores the padding).
 *
 * Switch to varchar(255) and trim the existing rows in the same statement.
 */
export class FixAttachmentFileTypePadding1796000000000
  implements MigrationInterface
{
  name = "FixAttachmentFileTypePadding1796000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE attachments ALTER COLUMN file_type TYPE varchar(255) USING btrim(file_type)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE attachments ALTER COLUMN file_type TYPE character(100) USING btrim(file_type)`,
    );
  }
}
