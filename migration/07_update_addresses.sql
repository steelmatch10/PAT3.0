-- PAT 3.0 — Full Address Backfill
-- Generated from migration/addresses.json (Gemini-resolved from Google Maps place IDs)
-- Match strategy: ILIKE on the street portion only, then update to full address.
-- Safe to re-run — uses WHERE address NOT LIKE '%,%' to skip already-updated rows.

UPDATE properties SET address = '97 Throop Ave, New Brunswick, NJ 08901'        WHERE address ILIKE '97 Throop%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '163 Livingston Ave, New Brunswick, NJ 08901'   WHERE address ILIKE '163 Livingston%'          AND address NOT LIKE '%,%';
UPDATE properties SET address = '144 George St, New Brunswick, NJ 08901'        WHERE address ILIKE '144 George%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '130B Remsen Ave, New Brunswick, NJ 08901'      WHERE address ILIKE '130B Remsen%'             AND address NOT LIKE '%,%';
UPDATE properties SET address = '553 Fulton St, Brooklyn, NY 11201'             WHERE address ILIKE '553 Fulton%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '950 W 6th St, Plainfield, NJ 07063'            WHERE address ILIKE '950%6th%'                 AND address NOT LIKE '%,%';
UPDATE properties SET address = '55 Lufberry Ave, New Brunswick, NJ 08901'      WHERE address ILIKE '55 Lufberry%'             AND address NOT LIKE '%,%';
UPDATE properties SET address = '5 Llewellyn Pl, New Brunswick, NJ 08901'       WHERE address ILIKE '5 Llewellyn%'             AND address NOT LIKE '%,%';
UPDATE properties SET address = '693 Hanson Ave, Perth Amboy, NJ 08861'         WHERE address ILIKE '693 Hanson%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '30 Bender Ave, Iselin, NJ 08830'               WHERE address ILIKE '30 Bender%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '845 Hoover Dr, North Brunswick Township, NJ 08902' WHERE address ILIKE '845 Hoover%'          AND address NOT LIKE '%,%';
UPDATE properties SET address = '1819 Allen St, Rahway, NJ 07065'               WHERE address ILIKE '1819 Allen%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '264 Somerset St, New Brunswick, NJ 08901'      WHERE address ILIKE '264 Somerset%'            AND address NOT LIKE '%,%';
UPDATE properties SET address = '303 Holly Dr, Robbinsville, NJ 08691'          WHERE address ILIKE '303 Holly%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '68 Welton St, New Brunswick, NJ 08901'         WHERE address ILIKE '68 Welton%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '184 Green St, Woodbridge, NJ 07095'            WHERE address ILIKE '184 Green%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '46 Mitchell Ave, New Brunswick, NJ 08901'      WHERE address ILIKE '46 Mitchell%'             AND address NOT LIKE '%,%';
UPDATE properties SET address = '177 E Hazelwood Ave, Rahway, NJ 07065'         WHERE address ILIKE '177%Hazelwood%'           AND address NOT LIKE '%,%';
UPDATE properties SET address = '407 Alden Rd, Avenel, NJ 07001'                WHERE address ILIKE '407 Alden%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '197 Canterbury Ct, Piscataway, NJ 08854'       WHERE address ILIKE '197 Canterbury%'          AND address NOT LIKE '%,%';
UPDATE properties SET address = '232 Hamilton St, New Brunswick, NJ 08901'      WHERE address ILIKE '232 Hamilton%'            AND address NOT LIKE '%,%';
UPDATE properties SET address = '79 Throop Ave, New Brunswick, NJ 08901'        WHERE address ILIKE '79 Throop%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '220 Paul Robeson Blvd, New Brunswick, NJ 08901' WHERE address ILIKE '220 Paul Robeson%'        AND address NOT LIKE '%,%';
UPDATE properties SET address = '104 Howard St, New Brunswick, NJ 08901'        WHERE address ILIKE '104 Howard%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '11 Cotter Dr, New Brunswick, NJ 08901'         WHERE address ILIKE '11 Cotter%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '66 Augusta St, South Amboy, NJ 08879'          WHERE address ILIKE '66 Augusta%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '73 Remsen Ave, New Brunswick, NJ 08901'        WHERE address ILIKE '73 Remsen%'               AND address NOT LIKE '%,%';
UPDATE properties SET address = '58 St Nicholas Ave, Brooklyn, NY 11237'        WHERE address ILIKE '58%Nicholas%'             AND address NOT LIKE '%,%';
UPDATE properties SET address = '115 Remsen Ave, New Brunswick, NJ 08901'       WHERE address ILIKE '115 Remsen%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '124 Dunbar Ave, Fords, NJ 08863'               WHERE address ILIKE '124 Dunbar%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '43 Grove Pl, East Orange, NJ 07017'            WHERE address ILIKE '43 Grove%'                AND address NOT LIKE '%,%';
UPDATE properties SET address = '441 Dutch Neck Rd, East Windsor, NJ 08520'     WHERE address ILIKE '441 Dutch Neck%'          AND address NOT LIKE '%,%';
UPDATE properties SET address = '308 Seaman St, New Brunswick, NJ 08901'        WHERE address ILIKE '308 Seaman%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '507 S 19th St, Newark, NJ 07103'               WHERE address ILIKE '507%19th%'                AND address NOT LIKE '%,%';
UPDATE properties SET address = '21 Beverly St, Newark, NJ 07108'               WHERE address ILIKE '21 Beverly%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '5 Peppermint Hill Rd, North Brunswick Township, NJ 08902' WHERE address ILIKE '5 Peppermint%' AND address NOT LIKE '%,%';
UPDATE properties SET address = '6 Lufberry Ave, New Brunswick, NJ 08901'       WHERE address ILIKE '6 Lufberry%'              AND address NOT LIKE '%,%';
UPDATE properties SET address = '420 Church Ln, North Brunswick Township, NJ 08902' WHERE address ILIKE '420 Church%'          AND address NOT LIKE '%,%';
UPDATE properties SET address = '11 Edgeworth Pl, New Brunswick, NJ 08901'      WHERE address ILIKE '11 Edgeworth%'            AND address NOT LIKE '%,%';

UPDATE properties SET address = '12 Union St, Kingston, NJ 08528'              WHERE address ILIKE '12 Union%'                AND address NOT LIKE '%,%';
UPDATE properties SET address = '11 N Randolphville Rd, Piscataway, NJ 08854'  WHERE address ILIKE '11%Randolphville%'         AND address NOT LIKE '%,%';
UPDATE properties SET address = '913 Eden Ave, Highland Park, NJ 08904'         WHERE address ILIKE '913 Eden%'                AND address NOT LIKE '%,%';

-- Verify: should show 0 rows if all addresses were updated
SELECT id, address FROM properties WHERE address NOT LIKE '%,%' AND deleted_at IS NULL;
