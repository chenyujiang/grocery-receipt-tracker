update profiles p
set display_name = split_part(u.email, '@', 1)
from auth.users u
where p.user_id = u.id and p.display_name is null;
