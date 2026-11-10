-- A pending photo can be filed before a model is chosen.
-- truck_id stays a truckModel _id when it is set.
-- Matching still requires status = 'approved' and an embedding.

alter table photos alter column truck_id drop not null;
alter table photos alter column truck_slug drop not null;
