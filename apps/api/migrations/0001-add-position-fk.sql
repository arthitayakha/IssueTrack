ALTER TABLE users ADD COLUMN position_id INTEGER;

UPDATE users u
SET position_id = p.id
FROM positions p
WHERE u.position = p.name;

ALTER TABLE users
ADD CONSTRAINT fk_user_position
FOREIGN KEY (position_id) REFERENCES positions(id);

ALTER TABLE users DROP COLUMN position;
