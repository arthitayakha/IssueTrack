import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";

/**
 * A single "forgot password" link. Stores the SHA-256 of the token only —
 * the raw value exists in the e-mail (`?token=…`) and nowhere else.
 */
@Entity("password_reset_tokens")
export class PasswordResetToken {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: "user_id", type: "int" })
    userId!: number;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user?: User;

    /** sha256 hex (64 chars) of the token handed to the browser. */
    @Column({ name: "token_hash", type: "varchar", length: 64, unique: true })
    tokenHash!: string;

    @Column({ name: "expires_at", type: "timestamptz" })
    expiresAt!: Date;

    /** Null while the link is still usable; set the moment it is redeemed. */
    @Column({ name: "used_at", type: "timestamptz", nullable: true })
    usedAt!: Date | null;

    @CreateDateColumn({ name: "created_at", type: "timestamptz" })
    createdAt!: Date;
}
